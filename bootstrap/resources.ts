//The runtime resource contract exported for module callers
export type RuntimeResource = {
  name: string,
  ready?: () => boolean | Promise<boolean>,
  close: () => void | Promise<void>,
};

/**
 * Provide the runtime resources behavior used by this module.
 */
export class RuntimeResources {
  //Resources retain registration order so cleanup can reverse dependencies
  #resources: RuntimeResource[] = [];
  //The closed flag makes cleanup idempotent and blocks late registrations
  #closed = false;

  /**
   * Register one uniquely named runtime resource before cleanup begins.
   */
  public register(resource: RuntimeResource) {
    if (this.#closed) throw new Error('Cannot register a resource after cleanup');
    if (this.#resources.some((candidate) => candidate.name === resource.name)) {
      throw new Error(`Runtime resource already registered: ${resource.name}`);
    }
    this.#resources.push(resource);
    return resource;
  }

  /**
   * Run every resource readiness probe and retain per-resource results.
   */
  public async readiness() {
    //resources without an explicit probe are ready once registration succeeds
    const checks = await Promise.all(
      this.#resources.map(async (resource) => ({
        name: resource.name,
        ready: resource.ready ? await resource.ready() : true
      }))
    );
    return {
      ready: checks.every((check) => check.ready),
      checks
    };
  }

  /**
   * Close resources in reverse order within one shared shutdown deadline.
   */
  public async close(timeoutMs = 10_000) {
    //cleanup is idempotent because signals and explicit close can race
    if (this.#closed) return;
    this.#closed = true;
    const failures: Error[] = [];
    const deadline = Date.now() + timeoutMs;

    //reverse registration order so dependants close before their dependencies
    for (const resource of [...this.#resources].reverse()) {
      try {
        //each resource receives only the time left in the shared deadline
        let timeout: NodeJS.Timeout | undefined;
        const remainingMs = Math.max(0, deadline - Date.now());
        await Promise.race([
          Promise.resolve(resource.close()),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`Timed out closing runtime resource ${resource.name}`)),
              remainingMs
            );
          })
        ]).finally(() => {
          if (timeout) clearTimeout(timeout);
        });
      } catch (error) {
        //continue closing later resources and report every observed failure
        failures.push(
          error instanceof Error
            ? error
            : new Error(`Failed to close runtime resource ${resource.name}`)
        );
      }
    }

    //aggregate after best-effort cleanup so callers retain every failure cause
    if (failures.length) {
      throw new AggregateError(failures, 'One or more runtime resources failed to close');
    }
  }
}
