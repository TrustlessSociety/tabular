import { createHash, type Hash } from 'node:crypto';
import { IMPORT_PARSER_VERSION } from './contracts.js';

export class SourceFingerprint {
  readonly #hash: Hash = createHash('sha256');
  #bytes = 0;

  update(value: Uint8Array) {
    this.#hash.update(value);
    this.#bytes += value.byteLength;
  }

  get byteLength() {
    return this.#bytes;
  }

  digest() {
    return this.#hash.digest('hex');
  }
}

export function deterministicFingerprint(value: unknown) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function importFingerprint(input: {
  source: 'csv' | 'xlsx';
  sourceFingerprint: string;
  options: unknown;
}) {
  return deterministicFingerprint({
    parserVersion: IMPORT_PARSER_VERSION,
    source: input.source,
    sourceFingerprint: input.sourceFingerprint,
    options: input.options
  });
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

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
