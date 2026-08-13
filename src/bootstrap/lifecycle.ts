//client
import type {
  LifecycleResolutionPhase,
  ProcessName
} from '../config/phases.js';
import {
  assertPermittedPhase,
  PROCESS_PHASES
} from '../config/phases.js';

//The lifecycle phase contract exported for module callers
export type LifecyclePhase = 'initializing' | 'ready' | 'draining' | 'stopped';

//The process phase resolver contract used by thin entrypoints
export type ProcessPhaseResolver = {
  resolve: (phase: string) => Promise<unknown>,
};

/**
 * Resolve the exact lifecycle phases owned by one process profile.
 */
export async function resolveProcessPhases(
  server: ProcessPhaseResolver,
  process: ProcessName,
  additional: readonly LifecycleResolutionPhase[] = []
) {
  const phases = [...PROCESS_PHASES[process], ...additional];
  const resolved: LifecycleResolutionPhase[] = [];
  for (const phase of phases) {
    assertPermittedPhase(process, phase);
    if (resolved.includes(phase)) continue;
    await server.resolve(phase);
    resolved.push(phase);
  }
  return resolved;
}

/**
 * Provide the application lifecycle behavior used by this module.
 */
export class ApplicationLifecycle {
  //The phase gates readiness, request admission, draining, and final cleanup
  #phase: LifecyclePhase = 'initializing';
  //The in-flight counter prevents shutdown from abandoning accepted requests
  #inFlight = 0;
  //The drain waiters are released together when the counter reaches zero
  #waiters = new Set<() => void>();

  /**
   * Return the current application lifecycle phase.
   */
  public get phase() {
    return this.#phase;
  }

  /**
   * Return the number of requests still in flight.
   */
  public get inFlight() {
    return this.#inFlight;
  }

  /**
   * Report whether the lifecycle still accepts new requests.
   */
  public get accepting() {
    return this.#phase === 'initializing' || this.#phase === 'ready';
  }

  /**
   * Move the lifecycle from initializing to ready.
   */
  public markReady() {
    if (this.#phase !== 'initializing') {
      throw new Error(`Cannot become ready from ${this.#phase}`);
    }
    this.#phase = 'ready';
  }

  /**
   * Begin tracking one in-flight request.
   */
  public beginRequest() {
    //once draining begins, callers must reject rather than increment the count
    if (!this.accepting) return false;
    this.#inFlight += 1;
    return true;
  }

  /**
   * Finish tracking one in-flight request.
   */
  public endRequest() {
    //an underflow indicates mismatched request admission and completion
    if (this.#inFlight < 1) throw new Error('In-flight request counter underflow');
    this.#inFlight -= 1;

    //release every pending shutdown waiter on the final completion
    if (this.#inFlight === 0) {
      for (const resolve of this.#waiters) resolve();
      this.#waiters.clear();
    }
  }

  /**
   * Move the lifecycle into its draining phase.
   */
  public beginDrain() {
    if (this.#phase === 'stopped') return;
    this.#phase = 'draining';
  }

  /**
   * Move the lifecycle into its terminal stopped phase.
   */
  public markStopped() {
    this.#phase = 'stopped';
  }

  /**
   * Wait for in-flight requests to drain within the deadline.
   */
  public async waitForDrain(timeoutMs: number) {
    //avoid allocating timers when the runtime is already idle
    if (this.#inFlight === 0) return;

    //race the shared zero-counter signal against the caller's shutdown budget
    let timeout: NodeJS.Timeout | undefined;
    await Promise.race([
      new Promise<void>((resolve) => this.#waiters.add(resolve)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out draining ${this.#inFlight} request(s)`)),
          timeoutMs
        );
      })
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  }
}
