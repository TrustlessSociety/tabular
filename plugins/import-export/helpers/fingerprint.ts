//node
import type { Hash } from 'node:crypto';
import { createHash } from 'node:crypto';

//client
import { IMPORT_PARSER_VERSION } from './contracts.js';

/**
 * Provide the source fingerprint behavior used by this module.
 */
export class SourceFingerprint {
  //The hash state retained by this class instance
  readonly #hash: Hash = createHash('sha256');
  //The bytes state retained by this class instance
  #bytes = 0;

  /**
   * Add one byte chunk to the running source digest and size.
   */
  public update(value: Uint8Array) {
    this.#hash.update(value);
    this.#bytes += value.byteLength;
  }

  /**
   * Return the byte length value.
   */
  public get byteLength() {
    return this.#bytes;
  }

  /**
   * Handle the digest operation.
   */
  public digest() {
    return this.#hash.digest('hex');
  }
}

/**
 * Return the deterministic fingerprint result.
 */
export function deterministicFingerprint(value: unknown) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

/**
 * Import the fingerprint.
 */
export function importFingerprint(input: {
  source: 'csv' | 'xlsx',
  sourceFingerprint: string,
  options: unknown,
}) {
  return deterministicFingerprint({
    parserVersion: IMPORT_PARSER_VERSION,
    source: input.source,
    sourceFingerprint: input.sourceFingerprint,
    options: input.options
  });
}

/**
 * Return the canonical JSON result.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

/**
 * Return the canonical result.
 */
function canonical(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Fingerprint values must be finite');
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => typeof entry !== 'undefined')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  if (typeof value === 'undefined') return null;
  throw new Error(`Fingerprint value type is unsupported: ${typeof value}`);
}
