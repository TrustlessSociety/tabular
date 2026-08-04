import { createHash } from 'node:crypto';
import { writeLog } from '../../../bootstrap/logger.js';
import type { OperationAuthority, OperationJob } from './contracts.js';
import type { OperationsPluginService } from './service.js';

const PUMP_RETRY_BASE_MS = 250;
const PUMP_RETRY_MAX_MS = 30_000;
const PUMP_RETRY_MAX_EXPONENT = 7;

type ActiveExecution = {
  controller: AbortController;
  heartbeat?: NodeJS.Timeout;
  abandoned: boolean;
};

export class OperationExecutionError extends Error {
  constructor(
    readonly code: 'operation_failed' | 'handler_unavailable' | 'invalid_handler_result'
      | 'retention_denied' | 'retention_stale',
    readonly retryable: boolean
  ) {
    super(code);
    this.name = 'OperationExecutionError';
  }
}

export class OperationWorker {
  readonly #activeExecutions = new Set<ActiveExecution>();
  readonly #inFlight = new Set<Promise<void>>();
  readonly #leaseOwner: string;
  #timer?: NodeJS.Timeout;
  #draining = false;
  #pumpFailures = 0;
  #started = false;
  #stopping?: Promise<void>;

  constructor(
    private readonly operations: OperationsPluginService,
    readonly authority: OperationAuthority,
    leaseOwner = `${authority}:${process.pid}`,
    private readonly log: typeof writeLog = writeLog
  ) {
    this.#leaseOwner = leaseOwner;
  }

  start() {
    if (this.#started) return this;
    this.operations.prepareAuthority(this.authority);
    this.#started = true;
    this.operations.runtime.resources.register({
      name: `operations-${this.authority}-runner-${this.#leaseOwner}`,
      close: () => this.stop()
    });
    this.#schedule(0);
    return this;
  }

  async runOnce(jobId?: string) {
    if (this.#draining) return false;
    this.operations.prepareAuthority(this.authority);
    await this.operations.recoverExpired(this.authority);
    const job = await this.operations.claim(
      this.authority,
      this.#leaseOwner,
      jobId ? { jobId } : {}
    );
    if (!job) return false;
    if (this.#draining) {
      this.#deferClaimForLeaseRecovery();
      return false;
    }
    await this.#track(job);
    return true;
  }

  async stop() {
    this.#stopping ||= this.#drain();
    await this.#stopping;
  }

  async #drain() {
    this.#draining = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.#inFlight.size) return;
    let completed = false;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...this.#inFlight]).then(() => {
        completed = true;
      }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, this.operations.runtime.config.workers.shutdownTimeoutMs);
      })
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    if (completed) return;

    // Stop lease extension before aborting handlers so another process can
    // recover the still-running rows after their existing leases expire.
    for (const execution of this.#activeExecutions) {
      execution.abandoned = true;
      if (execution.heartbeat) clearInterval(execution.heartbeat);
      execution.heartbeat = undefined;
      execution.controller.abort(new Error('operation-shutdown-timeout'));
    }
  }

  #schedule(delayMs: number) {
    if (this.#draining || this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#runPump();
    }, delayMs);
  }

  async #runPump() {
    try {
      await this.#pump();
      this.#pumpFailures = 0;
      this.#schedule(this.#inFlight.size ? 100 : 250);
    } catch {
      if (this.#draining) return;

      this.#pumpFailures = Math.min(this.#pumpFailures + 1, PUMP_RETRY_MAX_EXPONENT + 1);
      const retryDelayMs = Math.min(
        PUMP_RETRY_MAX_MS,
        PUMP_RETRY_BASE_MS * 2 ** Math.min(this.#pumpFailures - 1, PUMP_RETRY_MAX_EXPONENT)
      );
      this.log('warn', 'operation_worker_pump_retry', {
        authority: this.authority,
        consecutiveFailures: this.#pumpFailures,
        failure: 'pump_unavailable',
        retryDelayMs
      });
      this.#schedule(retryDelayMs);
    }
  }

  async #pump() {
    if (this.#draining) return;
    await this.operations.recoverExpired(this.authority);
    const concurrency = this.operations.runtime.config.workers.concurrency;
    while (!this.#draining && this.#inFlight.size < concurrency) {
      const job = await this.operations.claim(this.authority, this.#leaseOwner);
      if (!job) break;
      if (this.#draining) {
        this.#deferClaimForLeaseRecovery();
        break;
      }
      void this.#track(job)
        .catch(() => {
          this.log('warn', 'operation_worker_execution_infrastructure_failure', {
            authority: this.authority,
            failure: 'completion_unavailable'
          });
        })
        .finally(() => {
          this.#schedule(0);
        });
    }
  }

  #deferClaimForLeaseRecovery() {
    this.log('info', 'operation_worker_claim_deferred', {
      authority: this.authority,
      reason: 'shutdown',
      recovery: 'lease_expiry'
    });
  }

  async #execute(job: OperationJob) {
    const lease = job.lease;
    if (!lease) throw new Error('Claimed operation did not include a lease');
    const registration = this.operations.handlers.resolve(
      job.kind,
      this.authority,
      job.schemaVersion
    );
    if (!registration) {
      await this.operations.finish(
        this.authority,
        job.id,
        lease.owner,
        lease.token,
        {
          state: 'dead-letter',
          progress: job.progress,
          error: { code: 'handler_unavailable', retryable: false },
          diagnostics: {
            reason: 'handler-unavailable',
            attempt: job.attempts,
            workerAuthority: this.authority
          }
        }
      );
      return;
    }

    const execution: ActiveExecution = {
      controller: new AbortController(),
      abandoned: false
    };
    this.#activeExecutions.add(execution);
    let leaseLost = false;
    const heartbeatMs = Math.max(
      250,
      Math.floor(this.operations.runtime.config.workers.leaseSeconds * 1000 / 3)
    );
    let heartbeatBusy = false;
    const heartbeat = async (progress?: number) => {
      if (execution.abandoned) return false;
      if (leaseLost || heartbeatBusy) return !leaseLost;
      heartbeatBusy = true;
      try {
        const kept = await this.operations.heartbeat(
          this.authority,
          job.id,
          lease.owner,
          lease.token,
          progress
        );
        if (!kept) {
          leaseLost = true;
          execution.controller.abort(new Error('operation-lease-lost'));
        }
        return kept;
      } finally {
        heartbeatBusy = false;
      }
    };
    const interval = setInterval(() => {
      void heartbeat().catch(() => {
        if (execution.abandoned || leaseLost) return;
        leaseLost = true;
        this.log('warn', 'operation_worker_heartbeat_unavailable', {
          authority: this.authority,
          failure: 'heartbeat_unavailable',
          recovery: 'bounded_retry_or_lease_expiry'
        });
        execution.controller.abort(new Error('operation-heartbeat-unavailable'));
      });
    }, heartbeatMs);
    execution.heartbeat = interval;
    const startedAt = Date.now();
    try {
      const result = await registration.handler({
        job: job as never,
        signal: execution.controller.signal,
        heartbeat,
        markIrreversible: () => this.operations.markIrreversible(
          this.authority,
          job.id,
          lease.owner,
          lease.token
        )
      });
      if (execution.abandoned) return;
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new OperationExecutionError('invalid_handler_result', false);
      }
      const finished = await this.operations.finish(
        this.authority,
        job.id,
        lease.owner,
        lease.token,
        {
          state: 'succeeded',
          progress: 100,
          result,
          diagnostics: {
            reason: 'completed',
            attempt: job.attempts,
            elapsedMs: Date.now() - startedAt,
            workerAuthority: this.authority
          }
        }
      );
      if (!finished) await this.#finishCancellation(job);
    } catch (error) {
      if (execution.abandoned) return;
      if (!await this.#finishCancellation(job)) {
        await this.#finishFailure(job, error, Date.now() - startedAt);
      }
    } finally {
      clearInterval(interval);
      execution.heartbeat = undefined;
      this.#activeExecutions.delete(execution);
    }
  }

  #track(job: OperationJob) {
    let work: Promise<void>;
    work = this.#execute(job).finally(() => {
      this.#inFlight.delete(work);
    });
    this.#inFlight.add(work);
    return work;
  }

  async #finishCancellation(job: OperationJob) {
    const lease = job.lease;
    if (!lease) return false;
    const status = await this.operations.leaseStatus(
      this.authority,
      job.id,
      lease.owner,
      lease.token
    );
    if (!status.owned || !status.cancelRequested || status.irreversible) return false;
    return Boolean(await this.operations.finish(
      this.authority,
      job.id,
      lease.owner,
      lease.token,
      {
        state: 'cancelled',
        progress: job.progress,
        error: { code: 'operation_cancelled', retryable: false },
        diagnostics: {
          reason: 'cancel-requested',
          attempt: job.attempts,
          workerAuthority: this.authority
        }
      }
    ));
  }

  async #finishFailure(job: OperationJob, error: unknown, elapsedMs: number) {
    const lease = job.lease;
    if (!lease) return;
    const classified = error instanceof OperationExecutionError
      ? error
      : new OperationExecutionError('operation_failed', true);
    const retryable = classified.retryable && job.attempts < job.maxAttempts;
    const exhausted = classified.retryable && job.attempts >= job.maxAttempts;
    const retryDelayMs = retryDelay(job.id, job.attempts);
    await this.operations.finish(
      this.authority,
      job.id,
      lease.owner,
      lease.token,
      {
        state: exhausted ? 'dead-letter' : classified.retryable ? 'retrying' : 'failed',
        progress: job.progress,
        ...(retryable ? { availableAfterMs: retryDelayMs } : {}),
        error: { code: classified.code, retryable },
        diagnostics: {
          reason: exhausted ? 'attempts-exhausted'
            : classified.retryable ? 'retry-scheduled' : 'non-retryable',
          attempt: job.attempts,
          elapsedMs,
          ...(retryable ? { retryDelayMs } : {}),
          workerAuthority: this.authority
        }
      }
    );
  }
}

function retryDelay(jobId: string, attempt: number) {
  const base = Math.min(60_000, 1000 * (2 ** Math.max(0, attempt - 1)));
  const byte = createHash('sha256')
    .update(`${jobId}:${attempt}`, 'utf8')
    .digest()[0] as number;
  const jitter = 0.9 + (byte / 255) * 0.2;
  return Math.max(250, Math.round(base * jitter));
}
