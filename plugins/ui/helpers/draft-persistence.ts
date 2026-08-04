export type SequencedDraftWrite<Handle, Result> = {
  result: Result;
  handle?: Handle;
};

export class DraftPersistenceSequencer<Handle> {
  #tail: Promise<unknown> = Promise.resolve();
  #handle: Handle | undefined;

  current() {
    return this.#handle;
  }

  replace(handle: Handle | undefined) {
    this.#handle = handle;
  }

  enqueue<Result>(
    write: (handle: Handle | undefined) => Promise<SequencedDraftWrite<Handle, Result>>
  ): Promise<Result> {
    const operation = this.#tail.then(async () => {
      const written = await write(this.#handle);
      if (written.handle) this.#handle = written.handle;
      return written.result;
    });
    this.#tail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async settle() {
    await this.#tail;
  }
}

/** Keeps independent persistence queues and remote handles for each draft. */
export class DraftPersistenceRegistry<Key, Handle> {
  #drafts = new Map<Key, DraftPersistenceSequencer<Handle>>();

  /** Removes every draft queue when the active file changes. */
  clear() {
    this.#drafts.clear();
  }

  /** Returns the current remote handle for one logical draft. */
  current(key: Key) {
    return this.#drafts.get(key)?.current();
  }

  /** Queues a write behind earlier writes for the same draft only. */
  enqueue<Result>(
    key: Key,
    write: (handle: Handle | undefined) => Promise<SequencedDraftWrite<Handle, Result>>
  ) {
    return this.#sequencer(key).enqueue(write);
  }

  /** Removes a completed or abandoned draft without disturbing adjacent rows. */
  remove(key: Key) {
    this.#drafts.delete(key);
  }

  /** Seeds or replaces the remote handle for a recovered draft. */
  replace(key: Key, handle: Handle | undefined) {
    this.#sequencer(key).replace(handle);
  }

  /** Waits only for writes belonging to the requested draft. */
  async settle(key: Key) {
    await this.#drafts.get(key)?.settle();
  }

  /** Creates a draft-local sequencer on first use. */
  #sequencer(key: Key) {
    const current = this.#drafts.get(key);
    if (current) return current;
    const created = new DraftPersistenceSequencer<Handle>();
    this.#drafts.set(key, created);
    return created;
  }
}
