//client
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { StableCatalogSnapshot } from './contracts.js';
import { discoverCallerCatalog } from './discovery.js';
import { reconcileCatalog } from './reconciliation.js';

//The catalog service value exported for module callers
export const CATALOG_SERVICE = 'tabular.catalog';

/**
 * Provide catalog plugin operations through one service boundary.
 */
export class CatalogPluginService {
  //The name state retained by this class instance
  public readonly name = CATALOG_SERVICE;

  /**
   * Create a CatalogPluginService instance.
   */
  public constructor(private readonly identity: IdentityPluginService) {}

  /**
   * Handle the discover operation.
   */
  public async discover(principal: BrowserPrincipal) {
    return catalogAuthorizedTransactions.run(() => withCatalogReconciliationRetry(async () => {
      let stable: StableCatalogSnapshot | undefined;
      return this.identity.authorizedTransaction(
        principal,
        'catalog.discover',
        async (database) => {
          if (!stable) throw new Error('Stable catalog reconciliation did not run');
          return discoverCallerCatalog(database, stable);
        },
        async (database) => {
          stable = await reconcileCatalog(database, principal.connectionId);
        }
      );
    }));
  }
}

/**
 * Provide the catalog discovery queue behavior used by this module.
 */
export class CatalogDiscoveryQueue {
  //The tail state retained by this class instance
  #tail = Promise.resolve();

  /**
   * Run one reconciliation operation after every earlier queued operation.
   */
  public async run<Result>(operation: () => Promise<Result>) {
    const previous = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

//The catalog authorized transactions value exported for module callers
export const catalogAuthorizedTransactions = new CatalogDiscoveryQueue();

/**
 * Return the with catalog reconciliation retry result.
 */
export async function withCatalogReconciliationRetry<Result>(
  operation: () => Promise<Result>,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 3 || !retryableReconciliation(error)) throw error;
      await pause(reconciliationRetryDelayMs(attempt));
    }
  }
  throw new Error('Catalog reconciliation retry bound was exhausted');
}

/**
 * Return the reconciliation retry delay ms result.
 */
export function reconciliationRetryDelayMs(attempt: number) {
  return attempt === 1 ? 100 : 250;
}

/**
 * Return the retryable reconciliation result.
 */
export function retryableReconciliation(error: unknown) {
  const pending: unknown[] = [error];
  const seen = new Set<object>();
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if ('code' in current && ['23505', '40001', '40P01'].includes(String(current.code))) {
      return true;
    }
    if ('cause' in current) pending.push(current.cause);
    if (current instanceof AggregateError) pending.push(...current.errors);
  }
  return false;
}
