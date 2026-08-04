export type RuntimeResource = {
  name: string;
  ready?: () => boolean | Promise<boolean>;
  close: () => void | Promise<void>;
};

export class RuntimeResources {
  #resources: RuntimeResource[] = [];
  #closed = false;

  register(resource: RuntimeResource) {
    if (this.#closed) throw new Error('Cannot register a resource after cleanup');
    if (this.#resources.some((candidate) => candidate.name === resource.name)) {
      throw new Error(`Runtime resource already registered: ${resource.name}`);
    }
    this.#resources.push(resource);
    return resource;
  }

  async readiness() {
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

  async close(timeoutMs = 10_000) {
    if (this.#closed) return;
    this.#closed = true;
    const failures: Error[] = [];
    const deadline = Date.now() + timeoutMs;
    for (const resource of [...this.#resources].reverse()) {
      try {
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
        failures.push(
          error instanceof Error
            ? error
            : new Error(`Failed to close runtime resource ${resource.name}`)
        );
      }
    }
    if (failures.length) {
      throw new AggregateError(failures, 'One or more runtime resources failed to close');
    }
  }
}
