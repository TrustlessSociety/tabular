//The canonical JSON value retains exact PostgreSQL JSONB text across the grid
export type CanonicalJsonValue = {
  type: 'json',
  shape: 'object' | 'string-array' | 'other',
  source: string,
};

/**
 * Build the bounded canonical JSON transport without narrowing numeric tokens.
 */
export function canonicalJsonValue(source: string): CanonicalJsonValue {
  if (typeof source !== 'string') throw new Error('Canonical JSON must use text transport');
  const value = JSON.parse(source) as unknown;
  const shape = Array.isArray(value)
    ? value.every((item) => typeof item === 'string') ? 'string-array' : 'other'
    : value !== null && typeof value === 'object' ? 'object' : 'other';
  return { type: 'json', shape, source };
}

/**
 * Return canonical JSON source for PostgreSQL binding and persistence.
 */
export function canonicalJsonSource(value: CanonicalJsonValue) {
  return value.source;
}
