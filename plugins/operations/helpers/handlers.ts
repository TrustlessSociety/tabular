//client
import type {
  OperationAuthority,
  OperationHandler,
  OperationHandlerRegistration,
  OperationKind
} from './contracts.js';

/**
 * Store and resolve operation handler registrations.
 */
export class OperationHandlerRegistry {
  //The handlers state retained by this class instance
  readonly #handlers = new Map<string, OperationHandlerRegistration>();

  /**
   * Register the current value.
   */
  public register<Kind extends OperationKind>(registration: OperationHandlerRegistration<Kind>) {
    if (!Number.isSafeInteger(registration.version) || registration.version < 1) {
      throw new Error('Operation handler version must be a positive integer');
    }
    const key = handlerKey(registration.kind, registration.version);
    if (this.#handlers.has(key)) {
      throw new Error(
        `Operation handler already registered: ${registration.kind} version ${registration.version}`
      );
    }
    this.#handlers.set(
      key,
      registration as unknown as OperationHandlerRegistration
    );
    return this;
  }

  /**
   * Resolve the current value.
   */
  public resolve(kind: OperationKind, authority: OperationAuthority, schemaVersion: number) {
    if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) return undefined;
    const registration = this.#handlers.get(handlerKey(kind, schemaVersion));
    if (!registration || registration.authority !== authority) return undefined;
    return registration;
  }

  /**
   * Handle the kinds operation.
   */
  public kinds(authority?: OperationAuthority) {
    return [...this.#handlers.values()]
      .filter((entry) => !authority || entry.authority === authority)
      .map((entry) => entry.kind);
  }
}

/**
 * Return the handler key result.
 */
function handlerKey(kind: OperationKind, schemaVersion: number) {
  return `${kind}:${schemaVersion}`;
}

/**
 * Return the operation handler result.
 */
export function operationHandler<Kind extends OperationKind>(
  kind: Kind,
  authority: OperationAuthority,
  handler: OperationHandler<Kind>,
  version = 1
): OperationHandlerRegistration<Kind> {
  return { kind, authority, version, handler };
}
