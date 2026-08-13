const MAX_IDENTIFIER_BYTES = 63;

//The qualified identifier contract exported for module callers
export type QualifiedIdentifier = {
  schema: string,
  name: string,
};

/**
 * Validate the identifier.
 */
export function validateIdentifier(value: string, label = 'identifier') {
  if (!value.length) throw new Error(`${label} cannot be empty`);
  if (value.includes('\0')) throw new Error(`${label} cannot contain NUL`);
  if (Buffer.byteLength(value, 'utf8') > MAX_IDENTIFIER_BYTES) {
    throw new Error(`${label} exceeds PostgreSQL's 63-byte identifier limit`);
  }
  return value;
}

/**
 * Quote the identifier.
 */
export function quoteIdentifier(value: string, label?: string) {
  return `"${validateIdentifier(value, label).replaceAll('"', '""')}"`;
}

/**
 * Return the qualified identifier result.
 */
export function qualifiedIdentifier(schema: string, name: string): QualifiedIdentifier {
  return {
    schema: validateIdentifier(schema, 'schema name'),
    name: validateIdentifier(name, 'object name')
  };
}

/**
 * Quote the qualified identifier.
 */
export function quoteQualifiedIdentifier(identifier: QualifiedIdentifier) {
  return `${quoteIdentifier(identifier.schema, 'schema name')}.${quoteIdentifier(identifier.name, 'object name')}`;
}
