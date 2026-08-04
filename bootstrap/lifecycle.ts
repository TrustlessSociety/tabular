export type LifecyclePhase = 'initializing' | 'ready' | 'draining' | 'stopped';

export class ApplicationLifecycle {
  #phase: LifecyclePhase = 'initializing';
  #inFlight = 0;
  #waiters = new Set<() => void>();

  get phase() {
    return this.#phase;
  }

  get inFlight() {
    return this.#inFlight;
  }

  get accepting() {
    return this.#phase === 'initializing' || this.#phase === 'ready';
  }

  markReady() {
    if (this.#phase !== 'initializing') {
      throw new Error(`Cannot become ready from ${this.#phase}`);
    }
    this.#phase = 'ready';
  }

  beginRequest() {
    if (!this.accepting) return false;
    this.#inFlight += 1;
    return true;
  }

  endRequest() {
    if (this.#inFlight < 1) throw new Error('In-flight request counter underflow');
    this.#inFlight -= 1;
    if (this.#inFlight === 0) {
      for (const resolve of this.#waiters) resolve();
      this.#waiters.clear();
    }
  }

  beginDrain() {
    if (this.#phase === 'stopped') return;
    this.#phase = 'draining';
  }

  markStopped() {
    this.#phase = 'stopped';
  }

  async waitForDrain(timeoutMs: number) {
    if (this.#inFlight === 0) return;
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
