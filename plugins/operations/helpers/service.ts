//node
import { createHash } from 'node:crypto';

//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type {
  EnqueueOperation,
  OperationActivity,
  OperationActivityList,
  OperationAuthority,
  OperationEventBatch,
  OperationJob,
  OperationKind,
  OperationPayload,
  OperationState
} from './contracts.js';
import type {
  OperationFileAuthorityTarget,
  StoredOperationEventRow,
  StoredOperationRow
} from './repository.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { isBrowserMutationPrincipal } from '../../identity/helpers/contracts.js';
import {
  IdentityRepository,
  assertUsableSession,
  verifyEffectiveRole
} from '../../identity/helpers/repository.js';
import { opaqueId, opaqueToken, tokenHash } from '../../identity/helpers/security.js';
import {
  OPERATION_SCHEMA_VERSION,
  operationAuthority
} from './contracts.js';
import { OperationHandlerRegistry } from './handlers.js';
import { OperationsRepository } from './repository.js';

//The operations service value exported for module callers
export const OPERATIONS_SERVICE = 'tabular.operations';
//The default operation retention days value exported for module callers
export const DEFAULT_OPERATION_RETENTION_DAYS = 90;
//The minimum operation retention days value exported for module callers
export const MINIMUM_OPERATION_RETENTION_DAYS = 30;

const terminalStates = new Set<OperationState>([
  'succeeded', 'failed', 'cancelled', 'dead-letter'
]);

//The operation completion contract exported for module callers
export type OperationCompletion = {
  state: Extract<OperationState, 'succeeded' | 'failed' | 'retrying' | 'cancelled' | 'dead-letter'>,
  progress: number,
  availableAt?: Date,
  availableAfterMs?: number,
  result?: Record<string, unknown>,
  error?: Record<string, unknown>,
  diagnostics?: Record<string, unknown>,
};

//The operation lifecycle event contract exported for module callers
export type OperationLifecycleEvent = 'cancelled' | 'retried' | 'terminal-failure';

//The operation lifecycle handler contract exported for module callers
export type OperationLifecycleHandler<Kind extends OperationKind = OperationKind> = (
  database: DatabaseExecutor,
  job: OperationJob<Kind>,
  event: OperationLifecycleEvent
) => Promise<void>;

/**
 * Provide operations plugin operations through one service boundary.
 */
export class OperationsPluginService {
  //The name state retained by this class instance
  public readonly name = OPERATIONS_SERVICE;
  //The handlers state retained by this class instance
  public readonly handlers = new OperationHandlerRegistry();
  //The lifecycles state retained by this class instance
  readonly #lifecycles = new Map<OperationKind, OperationLifecycleHandler>();

  /**
   * Create a OperationsPluginService instance.
   */
  public constructor(
    public readonly runtime: ApplicationRuntimeService,
    private readonly database: DatabasePluginService,
    private readonly identity: IdentityPluginService
  ) {}

  /**
   * Register the lifecycle.
   */
  public registerLifecycle<Kind extends OperationKind>(
    kind: Kind,
    handler: OperationLifecycleHandler<Kind>
  ) {
    if (this.#lifecycles.has(kind)) {
      throw new Error(`Operation lifecycle already registered: ${kind}`);
    }
    this.#lifecycles.set(kind, handler as unknown as OperationLifecycleHandler);
    return this;
  }

  /**
   * Handle the enqueue operation.
   */
  public async enqueue<Kind extends OperationKind>(
    principal: BrowserMutationPrincipal,
    request: EnqueueOperation<Kind>
  ): Promise<{ job: OperationJob<Kind>, replayed: boolean, }> {
    requireMutation(principal);
    validateEnqueue(request);
    let fileAuthorized = !request.fileId;
    let fileTarget: OperationFileAuthorityTarget | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.operations',
      async (database) => {
        if (request.fileId) fileAuthorized = await canReadFile(database, fileTarget);
        if (!fileAuthorized) unavailable();
        return true;
      },
      request.fileId ? async (database) => {
        fileTarget = (await new OperationsRepository(database)
          .fileAuthorityTargets([request.fileId!]))[0];
      } : undefined,
      async (database) => this.enqueueInTransaction(database, principal, request),
      'read committed'
    );
  }

  /**
   * Base-authority composition point for an already-authorized domain transaction.
   * The caller must enqueue only after the protected domain state is committed in
   * the same PostgreSQL transaction.
   */
  public async enqueueInTransaction<Kind extends OperationKind>(
    database: DatabaseExecutor,
    principal: BrowserPrincipal,
    request: EnqueueOperation<Kind>
  ): Promise<{ job: OperationJob<Kind>, replayed: boolean, }> {
    validatePrincipalScope(principal, request.fileId);
    validateEnqueue(request);
    const repository = new OperationsRepository(database);
    const jobId = opaqueId('job');
    const idempotencyKey = digest(`operation-idempotency:${request.idempotencyKey}`);
    const requestDigest = digest(canonicalJson({
      kind: request.kind,
      schemaVersion: OPERATION_SCHEMA_VERSION,
      authority: request.authority,
      fileId: request.fileId || null,
      payload: request.payload
    }));
    const retainedUntil = request.retainedUntil || new Date(
      Date.now() + MINIMUM_OPERATION_RETENTION_DAYS * 86_400_000
    );
    if (!Number.isFinite(retainedUntil.getTime()) || retainedUntil.getTime() <= Date.now()) {
      invalid('The operation retention deadline is invalid');
    }
    const result = await repository.enqueue({
      jobId,
      connectionId: principal.connectionId,
      actorIdentityId: principal.identityId,
      sessionId: principal.sessionId,
      historyScopeId: principal.historyScopeId,
      ...(request.fileId ? { fileId: request.fileId } : {}),
      kind: request.kind,
      authority: request.authority,
      idempotencyKey,
      requestDigest,
      payload: request.payload,
      maxAttempts: boundedInteger(request.maxAttempts ?? 3, 1, 20, 'attempt limit'),
      retainedUntil
    });
    if (
      result.idempotency.kind !== request.kind
      || Number(result.idempotency.schema_version) !== OPERATION_SCHEMA_VERSION
      || result.idempotency.request_digest !== requestDigest
    ) {
      throw new ApplicationError(
        'operation_idempotency_conflict',
        409,
        'The operation command was already used with a different request'
      );
    }
    if (!result.job) {
      throw new ApplicationError(
        'operation_replay_retired',
        409,
        'The operation was already completed and its activity record was retained as a tombstone'
      );
    }
    return {
      job: operationJob(result.job) as OperationJob<Kind>,
      replayed: result.replayed
    };
  }

  /**
   * List authorized operation activity under the caller's current scope.
   */
  public async list(
    principal: BrowserPrincipal,
    input: { status?: OperationState[], limit?: number, } = {}
  ): Promise<OperationActivityList> {
    const states = validateStates(input.status);
    const limit = boundedInteger(input.limit ?? 100, 1, 200, 'activity limit');
    let rows: StoredOperationRow[] = [];
    let fileTargets: OperationFileAuthorityTarget[] = [];
    let cursor = 0;
    let retentionDays = DEFAULT_OPERATION_RETENTION_DAYS;
    let canManageRetention = false;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.operations',
      async (database) => {
        const readableFiles = await readableFileIds(database, rows, fileTargets);
        return {
          items: rows.map((row) => activity(row, readableFiles.has(row.file_id || ''))),
          cursor,
          canManageRetention,
          retentionDays
        };
      },
      async (database) => {
        const repository = new OperationsRepository(database);
        rows = await repository.activity({
          connectionId: principal.connectionId,
          identityId: principal.identityId,
          ...(states.length ? { states } : {}),
          limit
        });
        cursor = await repository.currentCursor(principal.connectionId);
        retentionDays = await repository.retentionPolicy(principal.connectionId);
        fileTargets = await repository.fileAuthorityTargets(
          rows.flatMap((row) => row.file_id ? [row.file_id] : [])
        );
        canManageRetention = await repository.retentionAdminGrant(principal);
      },
      undefined,
      'read committed'
    );
  }

  /**
   * Return one authorized operation activity record by job identity.
   */
  public async get(
    principal: BrowserPrincipal,
    jobId: string
  ): Promise<OperationActivity | undefined> {
    validateJobId(jobId);
    let row: StoredOperationRow | undefined;
    let fileTarget: OperationFileAuthorityTarget | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.operations',
      async (database) => {
        const ownedRow = owned(row, principal) ? row : undefined;
        if (!ownedRow) return undefined;
        const readable = !ownedRow.file_id || await canReadFile(database, fileTarget);
        return activity(ownedRow, readable);
      },
      async (database) => {
        row = await new OperationsRepository(database).byIdForIdentity(
          jobId,
          principal.identityId
        );
        fileTarget = row?.file_id
          ? (await new OperationsRepository(database).fileAuthorityTargets([row.file_id]))[0]
          : undefined;
      },
      undefined,
      'read committed'
    );
  }

  /**
   * Mark read.
   */
  public markRead(principal: BrowserMutationPrincipal, jobId: string) {
    return this.mutateOwned(principal, jobId, (repository) =>
      repository.markRead(jobId, principal.identityId));
  }

  /**
   * Cancel the current value.
   */
  public cancel(principal: BrowserMutationPrincipal, jobId: string) {
    return this.mutateOwned(principal, jobId, async (repository, row, database) => {
      if (!['queued', 'retrying', 'running'].includes(row.state) || row.irreversible_at) {
        conflict('The operation can no longer be cancelled');
      }
      if (row.kind === 'ddl.apply') {
        conflict('Schema operations cannot be cancelled after confirmation');
      }
      const changed = await repository.requestCancellation(jobId);
      if (!changed) conflict('The operation changed before cancellation');
      if (changed.state === 'cancelled') {
        await this.invokeLifecycle(database, changed, 'cancelled');
      }
    }, true);
  }

  /**
   * Handle the retry operation.
   */
  public retry(principal: BrowserMutationPrincipal, jobId: string) {
    return this.mutateOwned(principal, jobId, async (repository, row, database) => {
      if (!['failed', 'dead-letter'].includes(row.state)) {
        conflict('Only a failed operation can be retried');
      }
      if (Number(row.attempts) >= 20) {
        conflict('The operation reached the maximum lifetime attempt count');
      }
      const changed = await repository.retry(jobId, 3);
      if (!changed) conflict('The operation changed before retry');
      await this.invokeLifecycle(database, changed, 'retried');
    }, true);
  }

  /**
   * Handle the acknowledge operation.
   */
  public acknowledge(principal: BrowserMutationPrincipal, jobId: string) {
    return this.mutateOwned(principal, jobId, async (repository, row) => {
      if (!['failed', 'dead-letter'].includes(row.state)) {
        conflict('Only a failed operation can be acknowledged');
      }
      if (!await repository.acknowledge(jobId, principal.identityId)) {
        conflict('The operation changed before acknowledgement');
      }
    });
  }

  /**
   * Handle the retention operation.
   */
  public async retention(
    principal: BrowserMutationPrincipal,
    input: { retentionDays: number, limit: number, }
  ) {
    requireMutation(principal);
    const retentionDays = boundedRetentionDays(input.retentionDays);
    const limit = boundedInteger(input.limit, 1, 500, 'retention limit');
    let permitted = false;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.operations',
      async () => {
        if (!permitted) {
          throw new ApplicationError(
            'operations_retention_denied',
            403,
            'The PostgreSQL operator has not allowed activity retention management'
          );
        }
        return true;
      },
      async (database) => {
        permitted = await new OperationsRepository(database).retentionAdminGrant(principal);
      },
      async (database) => {
        await new OperationsRepository(database).setRetentionPolicy(
          principal.connectionId,
          principal.identityId,
          retentionDays
        );
        return this.enqueueInTransaction(database, principal, {
          kind: 'operations.retention',
          authority: 'worker',
          idempotencyKey: `retention:${principal.sessionId}:${opaqueToken()}`,
          payload: { retentionDays, limit },
          maxAttempts: 3
        });
      },
      'read committed'
    );
  }

  /**
   * Read the events.
   */
  public async readEvents(
    principal: BrowserPrincipal,
    after: number,
    limit = 200
  ): Promise<OperationEventBatch> {
    after = boundedInteger(after, 0, Number.MAX_SAFE_INTEGER, 'operation cursor');
    limit = boundedInteger(limit, 1, 500, 'operation event limit');
    let state = { retainedFrom: 1, highWater: 0 };
    let rows: StoredOperationEventRow[] = [];
    return this.identity.authorizedTransaction(
      principal,
      'tabular.operations',
      async () => {
        const first = Number(rows[0]?.sequence || 0);
        const gap = after < state.retainedFrom - 1
          || after > state.highWater
          || (first > 0 && first > after + 1);
        const visible = rows.filter((row) =>
          row.event_type === 'operation.changed'
          && row.audience_identity_id === principal.identityId
          && validOperationEvent(row)
        );
        return {
          events: gap ? [] : visible.map(operationEvent),
          retainedFrom: state.retainedFrom,
          highWater: state.highWater,
          scannedThrough: Number(rows.at(-1)?.sequence || after),
          gap
        };
      },
      async (database) => {
        const repository = new OperationsRepository(database);
        state = await repository.streamState(principal.connectionId);
        rows = await repository.events(principal.connectionId, after, limit);
      },
      undefined,
      'read committed'
    );
  }

  /**
   * Handle the claim operation.
   */
  public async claim(
    authority: OperationAuthority,
    leaseOwner: string,
    input: { jobId?: string, } = {}
  ): Promise<OperationJob | undefined> {
    this.assertAuthority(authority);
    validateLeaseOwner(leaseOwner);
    if (input.jobId) validateJobId(input.jobId);
    const leaseToken = opaqueToken();
    return this.database.transaction(authority, {}, async (database) => {
      const row = await new OperationsRepository(database).claim({
        authority,
        leaseOwner,
        leaseToken,
        leaseTokenDigest: tokenHash(leaseToken),
        leaseSeconds: this.runtime.config.workers.leaseSeconds,
        ...(input.jobId ? { jobId: input.jobId } : {})
      });
      return row ? operationJob(row) : undefined;
    });
  }

  /**
   * Handle the recover expired operation.
   */
  public async recoverExpired(authority: OperationAuthority) {
    this.assertAuthority(authority);
    return this.database.transaction(authority, {}, async (database) => {
      const rows = await new OperationsRepository(database).recoverExpired(
        authority,
        this.runtime.config.workers.claimBatchSize
      );
      for (const row of rows) {
        await this.invokeLifecycle(
          database,
          row,
          row.state === 'cancelled' ? 'cancelled' : 'terminal-failure'
        );
      }
      return rows;
    });
  }

  /**
   * Handle the heartbeat operation.
   */
  public async heartbeat(
    authority: OperationAuthority,
    jobId: string,
    leaseOwner: string,
    leaseToken: string,
    progress?: number
  ) {
    this.assertAuthority(authority);
    validateLease(jobId, leaseOwner, leaseToken);
    const safeProgress = typeof progress === 'undefined'
      ? undefined
      : boundedInteger(progress, 0, 100, 'operation progress');
    return this.database.transaction(authority, {}, (database) =>
      new OperationsRepository(database).heartbeat({
        jobId,
        leaseOwner,
        leaseToken,
        leaseSeconds: this.runtime.config.workers.leaseSeconds,
        ...(typeof safeProgress === 'undefined' ? {} : { progress: safeProgress })
      }));
  }

  /**
   * Handle the lease status operation.
   */
  public async leaseStatus(
    authority: OperationAuthority,
    jobId: string,
    leaseOwner: string,
    leaseToken: string
  ) {
    this.assertAuthority(authority);
    validateLease(jobId, leaseOwner, leaseToken);
    return this.database.transaction(authority, {}, async (database) => {
      const row = await new OperationsRepository(database).byId(jobId);
      return {
        owned: Boolean(row
          && row.state === 'running'
          && row.lease_owner === leaseOwner
          && row.lease_token === leaseToken
          && row.lease_expires_at
          && new Date(row.lease_expires_at).getTime() > Date.now()),
        cancelRequested: Boolean(row?.cancel_requested_at),
        irreversible: Boolean(row?.irreversible_at)
      };
    });
  }

  /**
   * Mark irreversible.
   */
  public async markIrreversible(
    authority: OperationAuthority,
    jobId: string,
    leaseOwner: string,
    leaseToken: string
  ) {
    this.assertAuthority(authority);
    validateLease(jobId, leaseOwner, leaseToken);
    return this.database.transaction(authority, {}, (database) =>
      new OperationsRepository(database).markIrreversible(jobId, leaseOwner, leaseToken));
  }

  /**
   * Finish the current value.
   */
  public async finish(
    authority: OperationAuthority,
    jobId: string,
    leaseOwner: string,
    leaseToken: string,
    completion: OperationCompletion
  ) {
    this.assertAuthority(authority);
    validateLease(jobId, leaseOwner, leaseToken);
    const progress = boundedInteger(completion.progress, 0, 100, 'operation progress');
    const availableAfterMs = completion.availableAfterMs === undefined
      ? undefined
      : boundedInteger(
        completion.availableAfterMs,
        0,
        24 * 60 * 60 * 1000,
        'operation retry delay'
      );
    const error = completion.error ? redactedError(completion.error) : undefined;
    const diagnostics = redactedDiagnostics(completion.diagnostics || {});
    return this.database.transaction(authority, {}, async (database) => {
      const repository = new OperationsRepository(database);
      const current = await repository.byId(jobId);
      if (!current
        || current.lease_owner !== leaseOwner
        || current.lease_token !== leaseToken) return undefined;
      validateStoredOperation(current);
      const result = completion.result
        ? redactedResult(current.kind, completion.result)
        : undefined;
      const resultFileId = completion.state === 'succeeded' && result
        ? operationResultFileId(current.kind, result)
        : undefined;
      const finished = await repository.finish({
        jobId,
        leaseOwner,
        leaseToken,
        state: completion.state,
        progress,
        ...(completion.availableAt ? { availableAt: completion.availableAt } : {}),
        ...(availableAfterMs === undefined ? {} : { availableAfterMs }),
        ...(result ? { result } : {}),
        ...(resultFileId ? { resultFileId } : {}),
        ...(error ? { error } : {}),
        diagnostics
      });
      if (finished && ['cancelled', 'failed', 'dead-letter'].includes(finished.state)) {
        await this.invokeLifecycle(
          database,
          finished,
          finished.state === 'cancelled' ? 'cancelled' : 'terminal-failure'
        );
      }
      return finished;
    });
  }

  /**
   * Apply the retention job.
   */
  public async applyRetentionJob(
    authority: OperationAuthority,
    job: OperationJob<'operations.retention'>
  ) {
    this.assertAuthority(authority);
    if (job.kind !== 'operations.retention' || job.authority !== authority) {
      throw new Error('Retention operation authority is invalid');
    }
    const retentionDays = boundedRetentionDays(job.payload.retentionDays);
    const limit = boundedInteger(job.payload.limit, 1, 500, 'retention limit');
    let permitted = false;
    return this.database.transaction(authority, {
      resolveRole: async (database) => {
        const identities = new IdentityRepository(database);
        await identities.lockIdentity(job.actorIdentityId);
        await identities.lockMapping(job.actorIdentityId, job.connectionId);
        await identities.lockAllowedRoleForMapping(job.actorIdentityId, job.connectionId);
        const row = assertUsableSession(await identities.sessionById(job.sessionId));
        if (row.identity_id !== job.actorIdentityId
          || row.connection_id !== job.connectionId
          || row.history_scope_id !== job.historyScopeId) {
          throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
        }
        permitted = await new OperationsRepository(database).retentionAdminGrant({
          identityId: job.actorIdentityId,
          sessionId: job.sessionId,
          connectionId: job.connectionId,
          historyScopeId: job.historyScopeId
        });
        return {
          role: row.configured_role_name,
          verifyAfterSet: (effectiveDatabase: DatabaseExecutor) => verifyEffectiveRole(
            effectiveDatabase,
            { oid: row.configured_role_oid, name: row.configured_role_name }
          )
        };
      },
      finalizeBase: async (database) => {
        if (!permitted) {
          throw new ApplicationError(
            'operations_retention_denied',
            403,
            'Activity retention authority was revoked before execution'
          );
        }
        const repository = new OperationsRepository(database);
        const currentPolicy = await repository.retentionPolicy(job.connectionId);
        if (currentPolicy !== retentionDays) {
          throw new ApplicationError(
            'operations_retention_stale',
            409,
            'A newer activity retention policy replaced this operation'
          );
        }
        return repository.retain({
          connectionId: job.connectionId,
          retentionDays,
          limit
        });
      }
    }, async () => permitted);
  }

  /**
   * Handle the mutate owned operation.
   */
  private async mutateOwned(
    principal: BrowserMutationPrincipal,
    jobId: string,
    mutate: (
      repository: OperationsRepository,
      row: StoredOperationRow,
      database: DatabaseExecutor
    ) => Promise<unknown>,
    requireCurrentFileAuthority = false
  ): Promise<OperationActivity | undefined> {
    requireMutation(principal);
    validateJobId(jobId);
    let row: StoredOperationRow | undefined;
    let fileTarget: OperationFileAuthorityTarget | undefined;
    let permitted = false;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.operations',
      async (database) => {
        permitted = owned(row, principal)
          && (!requireCurrentFileAuthority || !row?.file_id
            || await canReadFile(database, fileTarget));
        return permitted;
      },
      async (database) => {
        row = await new OperationsRepository(database).byId(jobId, true);
        fileTarget = row?.file_id
          ? (await new OperationsRepository(database).fileAuthorityTargets([row.file_id]))[0]
          : undefined;
      },
      async (database) => {
        if (!permitted || !row) return undefined;
        const repository = new OperationsRepository(database);
        await mutate(repository, row, database);
        const current = await repository.byIdForIdentity(jobId, principal.identityId);
        return current ? activity(current, false) : undefined;
      },
      'read committed'
    );
  }

  /**
   * Assert the authority.
   */
  private assertAuthority(authority: OperationAuthority) {
    if (this.runtime.processKind !== authority) {
      throw new ApplicationError(
        'operation_authority_denied',
        403,
        `Only the separate ${authority} process can execute this operation`
      );
    }
  }

  /**
   * Prepare the authority.
   */
  public prepareAuthority(authority: OperationAuthority) {
    this.assertAuthority(authority);
    this.database.openPool(authority);
  }

  /**
   * Handle the invoke lifecycle operation.
   */
  private async invokeLifecycle(
    database: DatabaseExecutor,
    row: StoredOperationRow,
    event: OperationLifecycleEvent
  ) {
    const handler = this.#lifecycles.get(row.kind);
    if (!handler) return;
    await handler(database, operationJob(row), event);
  }
}

/**
 * Return the operation job result.
 */
function operationJob(row: StoredOperationRow): OperationJob {
  validateStoredOperation(row);
  return {
    id: row.id,
    connectionId: row.connection_id,
    actorIdentityId: row.actor_identity_id,
    sessionId: row.session_id,
    historyScopeId: row.history_scope_id,
    ...(row.file_id ? { fileId: row.file_id } : {}),
    kind: row.kind,
    schemaVersion: OPERATION_SCHEMA_VERSION,
    authority: row.authority_scope,
    payload: structuredClone(row.payload),
    state: row.state,
    progress: Number(row.progress),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    version: Number(row.version),
    ...(row.lease_owner && row.lease_token && row.lease_expires_at ? {
      lease: {
        owner: row.lease_owner,
        token: row.lease_token,
        expiresAt: iso(row.lease_expires_at)
      }
    } : {}),
    ...(row.cancel_requested_at ? { cancelRequestedAt: iso(row.cancel_requested_at) } : {}),
    ...(row.irreversible_at ? { irreversibleAt: iso(row.irreversible_at) } : {})
  };
}

/**
 * Return the activity result.
 */
function activity(row: StoredOperationRow, canLink: boolean): OperationActivity {
  const failed = row.state === 'failed' || row.state === 'dead-letter';
  const terminal = terminalStates.has(row.state);
  return {
    id: row.id,
    kind: row.kind,
    state: row.state,
    progress: Number(row.progress),
    attempt: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    version: Number(row.version),
    ...(row.file_id ? { fileId: row.file_id } : {}),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...(row.started_at ? { startedAt: iso(row.started_at) } : {}),
    ...(row.finished_at ? { finishedAt: iso(row.finished_at) } : {}),
    ...(row.cancel_requested_at ? { cancelRequestedAt: iso(row.cancel_requested_at) } : {}),
    ...(row.result_summary ? { resultSummary: structuredClone(row.result_summary) } : {}),
    ...(row.error_summary ? { errorSummary: safeError(row.error_summary) } : {}),
    ...(canLink && row.state === 'succeeded' && row.result_summary
      && row.file_id && row.schema_name && row.object_name ? {
      resultLink: {
        kind: 'file',
        fileId: row.file_id,
        href: `/pages/table.html?folder=${encodeURIComponent(row.schema_name)}&table=${encodeURIComponent(row.object_name)}`
      }
    } : {}),
    unread: !row.read_at
      || new Date(row.read_at).getTime() < new Date(row.updated_at).getTime(),
    ...(row.read_at ? { readAt: iso(row.read_at) } : {}),
    ...(row.acknowledged_at ? { acknowledgedAt: iso(row.acknowledged_at) } : {}),
    cancellable: ['queued', 'retrying', 'running'].includes(row.state)
      && !row.irreversible_at && row.kind !== 'ddl.apply',
    retryable: failed && Number(row.attempts) < 20,
    acknowledgeable: failed && !row.acknowledged_at,
    irreversible: Boolean(row.irreversible_at),
    ...(terminal ? {} : {})
  };
}

/**
 * Return the operation event result.
 */
function operationEvent(row: StoredOperationEventRow) {
  return {
    cursor: Number(row.sequence),
    jobId: row.payload.jobId as string,
    ...(row.file_id ? { fileId: row.file_id } : {}),
    state: row.payload.state as OperationState,
    kind: row.payload.kind as OperationKind,
    progress: Number(row.payload.progress),
    version: Number(row.payload.version),
    createdAt: iso(row.created_at)
  };
}

/**
 * Report the valid operation event condition.
 */
function validOperationEvent(row: StoredOperationEventRow) {
  const payload = row.payload;
  return Boolean(payload
    && typeof payload === 'object'
    && typeof payload.jobId === 'string'
    && /^job_[A-Za-z0-9_-]{32,64}$/.test(payload.jobId)
    && typeof payload.kind === 'string'
    && payload.kind in operationAuthority
    && typeof payload.state === 'string'
    && ['queued', 'running', 'succeeded', 'failed', 'retrying', 'cancelled', 'dead-letter']
      .includes(payload.state)
    && Number.isSafeInteger(Number(payload.progress))
    && Number(payload.progress) >= 0 && Number(payload.progress) <= 100
    && Number.isSafeInteger(Number(payload.version))
    && Number(payload.version) > 0);
}

/**
 * Return the readable file ids result.
 */
async function readableFileIds(
  database: DatabaseExecutor,
  rows: StoredOperationRow[],
  targets: OperationFileAuthorityTarget[]
) {
  const ids = [...new Set(rows.flatMap((row) => row.file_id ? [row.file_id] : []))];
  const byId = new Map(targets.map((target) => [target.file_id, target]));
  const readable = new Set<string>();
  for (const id of ids) if (await canReadFile(database, byId.get(id))) readable.add(id);
  return readable;
}

/**
 * Report whether the caller can read file.
 */
async function canReadFile(
  database: DatabaseExecutor,
  target: OperationFileAuthorityTarget | undefined
) {
  if (!target
    || !['current', 'renamed', 'changed'].includes(target.object_state)
    || !['r', 'p', 'v', 'm', 'f'].includes(target.relation_kind)) return false;
  const result = await database.execute<{ allowed: boolean, }>(`
    SELECT has_schema_privilege(current_user, CAST(? AS oid), 'USAGE') AND (
      has_table_privilege(current_user, CAST(? AS oid), 'SELECT') OR EXISTS (
        SELECT 1 FROM pg_attribute attribute
         WHERE attribute.attrelid = CAST(? AS oid)
           AND attribute.attnum > 0 AND NOT attribute.attisdropped
           AND has_column_privilege(
             current_user, CAST(? AS oid), attribute.attnum, 'SELECT'
           )
      )
    ) AS allowed
  `, [
    target.namespace_oid,
    target.relation_oid,
    target.relation_oid,
    target.relation_oid
  ]);
  return Boolean(result.rows[0]?.allowed);
}

/**
 * Validate the enqueue.
 */
function validateEnqueue(request: EnqueueOperation) {
  if (!request || typeof request !== 'object') invalid('The operation request is invalid');
  if (!(request.kind in operationAuthority) || request.authority !== operationAuthority[request.kind]) {
    invalid('The operation authority is invalid');
  }
  if (typeof request.idempotencyKey !== 'string'
    || request.idempotencyKey.length < 1 || request.idempotencyKey.length > 512
    || /[\u0000-\u001f\u007f]/.test(request.idempotencyKey)) {
    invalid('The operation command key is invalid');
  }
  if (request.fileId && !/^obj_[A-Za-z0-9_-]{32,64}$/.test(request.fileId)) {
    invalid('The operation file reference is invalid');
  }
  validatePayload(request.kind, request.payload, request.fileId);
  if (typeof request.maxAttempts !== 'undefined') {
    boundedInteger(request.maxAttempts, 1, 20, 'attempt limit');
  }
}

/**
 * Validate the payload.
 */
function validatePayload(kind: OperationKind, payload: OperationPayload, fileId?: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    invalid('The operation payload is invalid');
  }
  const value = payload as unknown as Record<string, unknown>;
  if (kind === 'maintenance.import-staging') {
    exactKeys(value, ['limit']);
    boundedInteger(value.limit, 1, 500, 'maintenance limit');
    return;
  }
  if (kind === 'operations.retention') {
    exactKeys(value, ['retentionDays', 'limit']);
    boundedRetentionDays(value.retentionDays);
    boundedInteger(value.limit, 1, 500, 'retention limit');
    return;
  }
  if (kind === 'export.csv') {
    exactKeys(value, ['exportRequestId', 'fileId']);
    opaqueReference(value.exportRequestId, 'export request');
    if (typeof value.fileId !== 'string' || !/^obj_[A-Za-z0-9_-]{32,64}$/.test(value.fileId)) {
      invalid('The export file reference is invalid');
    }
    if (!fileId || value.fileId !== fileId) {
      invalid('The export operation must be bound to its referenced file');
    }
    return;
  }
  const key = kind === 'import.commit' ? 'importId'
    : kind === 'ddl.apply' ? 'requestId'
      : kind === 'draft.promote' ? 'draftId'
        : 'maintenanceId';
  exactKeys(value, [key, ...(kind === 'row-order.maintenance' ? ['fileId'] : [])]);
  opaqueReference(value[key], key);
  if (kind === 'row-order.maintenance'
    && (typeof value.fileId !== 'string' || !/^obj_[A-Za-z0-9_-]{32,64}$/.test(value.fileId))) {
    invalid('The row-order file reference is invalid');
  }
  if (kind === 'row-order.maintenance' && (!fileId || value.fileId !== fileId)) {
    invalid('The row-order operation must be bound to its referenced file');
  }
}

/**
 * Validate the stored operation.
 */
function validateStoredOperation(row: StoredOperationRow) {
  const kind = row.kind;
  const schemaVersion = Number(row.schema_version);
  if (!(kind in operationAuthority)
    || schemaVersion !== OPERATION_SCHEMA_VERSION
    || row.authority_scope !== operationAuthority[kind]) {
    throw new Error('Stored operation contract is unsupported');
  }
  try {
    validatePayload(kind, row.payload, row.file_id || undefined);
  } catch (error) {
    throw new Error('Stored operation payload is invalid', { cause: error });
  }
}

/**
 * Validate the principal scope.
 */
function validatePrincipalScope(principal: BrowserPrincipal, fileId?: string) {
  if (!principal || principal.transport !== 'browser'
    || !/^[a-z][a-z0-9_-]{0,62}$/.test(principal.connectionId)
    || !/^id_[A-Za-z0-9_-]{32,64}$/.test(principal.identityId)
    || !/^sess_[A-Za-z0-9_-]{32,64}$/.test(principal.sessionId)
    || !/^hist_[A-Za-z0-9_-]{32,64}$/.test(principal.historyScopeId)) {
    throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
  }
  if (fileId && !/^obj_[A-Za-z0-9_-]{32,64}$/.test(fileId)) invalid('The file is invalid');
}

/**
 * Return the owned result.
 */
function owned(row: StoredOperationRow | undefined, principal: BrowserPrincipal) {
  return Boolean(row
    && row.connection_id === principal.connectionId
    && row.actor_identity_id === principal.identityId);
}

/**
 * Validate the states.
 */
function validateStates(input?: OperationState[]) {
  if (typeof input === 'undefined') return [];
  if (!Array.isArray(input) || input.length > 7) invalid('The operation state filter is invalid');
  const allowed = new Set<OperationState>([
    'queued', 'running', 'succeeded', 'failed', 'retrying', 'cancelled', 'dead-letter'
  ]);
  const states = [...new Set(input)];
  if (states.some((state) => !allowed.has(state))) invalid('The operation state filter is invalid');
  return states;
}

/**
 * Validate the job id.
 */
function validateJobId(jobId: string) {
  if (typeof jobId !== 'string' || !/^job_[A-Za-z0-9_-]{32,64}$/.test(jobId)) {
    invalid('The operation ID is invalid');
  }
}

/**
 * Validate the lease.
 */
function validateLease(jobId: string, leaseOwner: string, leaseToken: string) {
  validateJobId(jobId);
  validateLeaseOwner(leaseOwner);
  if (typeof leaseToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(leaseToken)) {
    throw new Error('Operation lease token is invalid');
  }
}

/**
 * Validate the lease owner.
 */
function validateLeaseOwner(leaseOwner: string) {
  if (typeof leaseOwner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(leaseOwner)) {
    throw new Error('Operation lease owner is invalid');
  }
}

/**
 * Return the bounded retention days result.
 */
function boundedRetentionDays(value: unknown) {
  const days = boundedInteger(value, 30, 365, 'retention days');
  if (![30, 90, 180, 365].includes(days)) invalid('The retention period is invalid');
  return days;
}

/**
 * Return the bounded integer result.
 */
function boundedInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    invalid(`The ${label} is invalid`);
  }
  return Number(value);
}

/**
 * Return the exact keys result.
 */
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length
    || Object.keys(value).some((key) => !keys.includes(key))) {
    invalid('The operation payload envelope is invalid');
  }
}

/**
 * Return the opaque reference result.
 */
function opaqueReference(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]*_[A-Za-z0-9_-]{32,64}$/.test(value)) {
    invalid(`The ${label} reference is invalid`);
  }
}

/**
 * Return the redacted summary result.
 */
function redactedSummary(value: Record<string, unknown>, label: string) {
  const result: Record<string, string | number | boolean | null> = {};
  const entries = Object.entries(value);
  if (entries.length > 20) throw new Error(`Operation ${label} is too large`);
  for (const [key, entry] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) {
      throw new Error(`Operation ${label} key is invalid`);
    }
    if (entry === null || typeof entry === 'boolean'
      || (typeof entry === 'number' && Number.isFinite(entry))) {
      result[key] = entry;
    } else if (typeof entry === 'string' && entry.length <= 500
      && !/[\u0000-\u001f\u007f]/.test(entry)) {
      result[key] = entry;
    } else {
      throw new Error(`Operation ${label} contains an unsafe value`);
    }
  }
  return result;
}

const resultKeys: Record<OperationKind, ReadonlySet<string>> = {
  'import.commit': new Set([
    'importId', 'state', 'fileId', 'rowsCommitted', 'columnsCommitted', 'warnings'
  ]),
  'export.csv': new Set(['exportRequestId', 'fileId', 'rowCount', 'columnCount']),
  'ddl.apply': new Set(['requestId', 'actionType', 'state', 'targetObjectId']),
  'draft.promote': new Set(['draftId', 'actionId', 'state', 'rowCount']),
  'row-order.maintenance': new Set([
    'maintenanceId', 'fileId', 'state', 'rowsUpdated'
  ]),
  'maintenance.import-staging': new Set([
    'operationsDeleted', 'chunksDeleted', 'issuesDeleted', 'googleSourcesDeleted'
  ]),
  'operations.retention': new Set([
    'jobsDeleted', 'eventsDeleted', 'cursorFloorsAdvanced', 'retentionDays'
  ])
};

/**
 * Return the redacted result result.
 */
function redactedResult(kind: OperationKind, value: Record<string, unknown>) {
  const allowed = resultKeys[kind];
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`Operation ${kind} returned a disallowed summary field`);
  }
  return redactedSummary(value, `${kind} result`);
}

/**
 * Return the operation result file id result.
 */
function operationResultFileId(kind: OperationKind, result: Record<string, unknown>) {
  const value = kind === 'import.commit' ? result.fileId
    : kind === 'ddl.apply' ? result.targetObjectId
      : undefined;
  if (typeof value === 'undefined') return undefined;
  if (typeof value !== 'string' || !/^obj_[A-Za-z0-9_-]{32,64}$/.test(value)) {
    throw new Error(`Operation ${kind} returned an invalid file result`);
  }
  return value;
}

/**
 * Return the redacted diagnostics result.
 */
function redactedDiagnostics(value: Record<string, unknown>) {
  const allowed = new Set([
    'reason', 'attempt', 'elapsedMs', 'retryDelayMs', 'workerAuthority'
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('Operation diagnostics contain a disallowed field');
  }
  const summary = redactedSummary(value, 'diagnostics');
  const reasons = new Set([
    'completed', 'handler-unavailable', 'cancel-requested',
    'attempts-exhausted', 'retry-scheduled', 'non-retryable', 'lease-expired'
  ]);
  if (typeof summary.reason !== 'undefined'
    && (typeof summary.reason !== 'string' || !reasons.has(summary.reason))) {
    throw new Error('Operation diagnostic reason is invalid');
  }
  if (typeof summary.workerAuthority !== 'undefined'
    && !['worker', 'migrator'].includes(String(summary.workerAuthority))) {
    throw new Error('Operation diagnostic authority is invalid');
  }
  return summary;
}

/**
 * Return the redacted error result.
 */
function redactedError(value: Record<string, unknown>) {
  const messages: Record<string, string> = {
    operation_failed: 'The operation could not be completed.',
    handler_unavailable: 'This operation cannot run on the configured process.',
    lease_expired: 'The worker lease expired before the operation completed.',
    operation_cancelled: 'The operation was cancelled before completion.',
    invalid_handler_result: 'The operation returned an invalid result.',
    retention_denied: 'Activity retention authority was revoked before execution.',
    retention_stale: 'A newer activity retention policy replaced this operation.'
  };
  const requested = typeof value.code === 'string' ? value.code : '';
  const code = Object.hasOwn(messages, requested) ? requested : 'operation_failed';
  return { code, message: messages[code] as string, retryable: value.retryable === true };
}

/**
 * Report the safe error condition.
 */
function safeError(value: Record<string, unknown>) {
  return redactedError(value);
}

/**
 * Return the canonical JSON result.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

/**
 * Return the digest result.
 */
function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Return the iso result.
 */
function iso(value: Date | string) {
  return new Date(value).toISOString();
}

/**
 * Return the require mutation result.
 */
function requireMutation(principal: BrowserMutationPrincipal) {
  if (!isBrowserMutationPrincipal(principal)) {
    throw new ApplicationError('operation_mutation_denied', 403, 'A browser mutation is required');
  }
}

/**
 * Return the invalid result.
 */
function invalid(message: string): never {
  throw new ApplicationError('invalid_operation', 400, message);
}

/**
 * Return the conflict result.
 */
function conflict(message: string): never {
  throw new ApplicationError('operation_conflict', 409, message);
}

/**
 * Return the unavailable result.
 */
function unavailable(): never {
  throw new ApplicationError('operation_unavailable', 404, 'The requested operation is unavailable');
}
