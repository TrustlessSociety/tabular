//client
import type { CanonicalJsonValue } from '../../capability/helpers/value-contracts.js';
import type { FileFieldKind } from '../../files/helpers/contracts.js';
import { canonicalJsonValue } from '../../capability/helpers/value-contracts.js';

//The expanded JSONB Fields supported by the first Field-editor slice
export type ExpandedFieldKind = Extract<
  FileFieldKind,
  'metadata' | 'tags' | 'text-list' | 'multi-select' | 'checkbox-list'
>;

//The optional choice membership supplied by configured collection Fields
export type ExpandedFieldCodecOptions = {
  allowedValues?: readonly string[],
};

//Stable codec failures let editor and action callers present owned messages
export type FieldCodecErrorCode =
  | 'invalid_json'
  | 'invalid_shape'
  | 'duplicate_key'
  | 'duplicate_item'
  | 'empty_item'
  | 'unknown_item'
  | 'value_too_large';

const MAXIMUM_JSON_BYTES = 100_000;

/**
 * Describe one stable expanded-Field codec failure.
 */
export class FieldCodecError extends Error {
  //The stable machine-readable category consumed by editor and action callers
  public code: FieldCodecErrorCode;

  //The optional bounded JSON location identifies the rejected key or item
  public path?: string;

  public constructor(code: FieldCodecErrorCode, message: string, path?: string) {
    super(message);
    this.name = 'FieldCodecError';
    this.code = code;
    if (path) this.path = path;
  }
}

/**
 * Decode one expanded Field draft without normalizing its JSON source.
 */
export function decodeExpandedFieldValue(
  field: ExpandedFieldKind,
  source: string | null,
  options: ExpandedFieldCodecOptions = {}
): CanonicalJsonValue | null {
  if (source === null) return null;
  assertBoundedSource(source);

  if (field === 'metadata') return decodeMetadataValue(source);
  return decodeStringArrayValue(field, source, options);
}

/**
 * Decode Metadata as a top-level object with unique keys and scalar values.
 */
export function decodeMetadataValue(source: string | null): CanonicalJsonValue | null {
  if (source === null) return null;
  assertBoundedSource(source);
  inspectMetadataSource(source);
  return canonicalJsonValue(source);
}

/**
 * Decode one JSONB string-array Field under its exact Field policy.
 */
export function decodeStringArrayValue(
  field: Exclude<ExpandedFieldKind, 'metadata'>,
  source: string | null,
  options: ExpandedFieldCodecOptions = {}
): CanonicalJsonValue | null {
  if (source === null) return null;
  assertBoundedSource(source);
  const items = inspectStringArraySource(source);

  //Tags alone own the frozen non-empty and unique item requirements
  if (field === 'tags') {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (item.trim().length === 0) {
        throw new FieldCodecError(
          'empty_item',
          'Tags cannot contain an empty item',
          `$[${index}]`
        );
      }
      if (seen.has(item)) {
        throw new FieldCodecError(
          'duplicate_item',
          'Tags cannot contain duplicate items',
          `$[${index}]`
        );
      }
      seen.add(item);
    });
  }

  //Restricted choice Fields compare exact stored values without coercion
  if (
    (field === 'multi-select' || field === 'checkbox-list')
    && options.allowedValues
  ) {
    const allowedValues = new Set(options.allowedValues);
    items.forEach((item, index) => {
      if (!allowedValues.has(item)) {
        throw new FieldCodecError(
          'unknown_item',
          'The collection contains a value outside its configured options',
          `$[${index}]`
        );
      }
    });
  }
  return canonicalJsonValue(source);
}

/**
 * Return exact JSON source while preserving SQL NULL as a separate value.
 */
export function expandedFieldSource(value: CanonicalJsonValue | null): string | null {
  return value === null ? null : value.source;
}

/**
 * Parse an accepted string-array transport for editor projection only.
 */
export function stringArrayItems(value: CanonicalJsonValue | null): string[] {
  if (value === null) return [];
  return inspectStringArraySource(value.source);
}

/**
 * Reject oversized drafts before running the JSON scanner or serializer.
 */
function assertBoundedSource(source: string): void {
  if (new TextEncoder().encode(source).byteLength > MAXIMUM_JSON_BYTES) {
    throw new FieldCodecError(
      'value_too_large',
      'JSON Field values must be at most 100000 UTF-8 bytes'
    );
  }
}

/**
 * Inspect Metadata members before JSONB can discard duplicate object keys.
 */
function inspectMetadataSource(source: string): void {
  let cursor = skipWhitespace(source, 0);
  if (source[cursor] !== '{') invalidShape('Metadata must be a top-level JSON object');
  cursor = skipWhitespace(source, cursor + 1);
  if (source[cursor] === '}') {
    assertFinished(source, cursor + 1);
    return;
  }

  const keys = new Set<string>();
  while (cursor < source.length) {
    if (source[cursor] !== '"') invalidJson('Metadata object keys must be JSON strings');
    const parsedKey = readJsonString(source, cursor);
    if (keys.has(parsedKey.value)) {
      throw new FieldCodecError(
        'duplicate_key',
        `Metadata contains the duplicate key ${JSON.stringify(parsedKey.value)}`,
        `$.${parsedKey.value}`
      );
    }
    keys.add(parsedKey.value);

    cursor = skipWhitespace(source, parsedKey.end);
    if (source[cursor] !== ':') invalidJson('Metadata object keys must be followed by a value');
    cursor = skipWhitespace(source, cursor + 1);
    cursor = readScalarValue(source, cursor);
    cursor = skipWhitespace(source, cursor);

    if (source[cursor] === '}') {
      assertFinished(source, cursor + 1);
      return;
    }
    if (source[cursor] !== ',') invalidJson('Metadata members must be separated by commas');
    cursor = skipWhitespace(source, cursor + 1);
    if (source[cursor] === '}') invalidJson('Metadata cannot contain a trailing comma');
  }
  invalidJson('Metadata contains incomplete JSON');
}

/**
 * Inspect a homogeneous string array while retaining its original source.
 */
function inspectStringArraySource(source: string): string[] {
  let cursor = skipWhitespace(source, 0);
  if (source[cursor] !== '[') invalidShape('The Field value must be a top-level JSON array');
  cursor = skipWhitespace(source, cursor + 1);
  if (source[cursor] === ']') {
    assertFinished(source, cursor + 1);
    return [];
  }

  const items: string[] = [];
  while (cursor < source.length) {
    if (source[cursor] !== '"') {
      invalidShape('Every collection item must be a JSON string');
    }
    const parsedItem = readJsonString(source, cursor);
    items.push(parsedItem.value);
    cursor = skipWhitespace(source, parsedItem.end);

    if (source[cursor] === ']') {
      assertFinished(source, cursor + 1);
      return items;
    }
    if (source[cursor] !== ',') invalidJson('Collection items must be separated by commas');
    cursor = skipWhitespace(source, cursor + 1);
    if (source[cursor] === ']') invalidJson('Collections cannot contain a trailing comma');
  }
  invalidJson('The collection contains incomplete JSON');
}

/**
 * Read a JSON string token and its decoded comparison value.
 */
function readJsonString(source: string, start: number): { value: string, end: number, } {
  let cursor = start + 1;
  while (cursor < source.length) {
    const character = source[cursor]!;
    if (character === '"') {
      const token = source.slice(start, cursor + 1);
      try {
        return { value: JSON.parse(token) as string, end: cursor + 1 };
      } catch {
        invalidJson('The Field contains an invalid JSON string');
      }
    }
    if (character === '\\') {
      cursor += 2;
      continue;
    }
    if (character.charCodeAt(0) <= 0x1f) {
      invalidJson('JSON strings cannot contain unescaped control characters');
    }
    cursor += 1;
  }
  invalidJson('The Field contains an unterminated JSON string');
}

/**
 * Read one JSON scalar without converting an exact numeric token to number.
 */
function readScalarValue(source: string, start: number): number {
  if (source[start] === '"') return readJsonString(source, start).end;
  if (source.startsWith('true', start)) return start + 4;
  if (source.startsWith('false', start)) return start + 5;
  if (source.startsWith('null', start)) return start + 4;
  if (source[start] === '{' || source[start] === '[') {
    invalidShape('Metadata values must be JSON scalars');
  }

  const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
    source.slice(start)
  );
  if (!number) invalidShape('Metadata values must be JSON scalars');
  return start + number[0].length;
}

/**
 * Skip JSON whitespace without changing the retained source.
 */
function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (/[\u0009\u000a\u000d\u0020]/.test(source[cursor] || '')) cursor += 1;
  return cursor;
}

/**
 * Ensure no non-whitespace source follows the accepted top-level value.
 */
function assertFinished(source: string, start: number): void {
  if (skipWhitespace(source, start) !== source.length) {
    invalidJson('The Field contains content after its top-level JSON value');
  }
}

/**
 * Throw one stable malformed-JSON failure.
 */
function invalidJson(message: string): never {
  throw new FieldCodecError('invalid_json', message);
}

/**
 * Throw one stable value-shape failure.
 */
function invalidShape(message: string): never {
  throw new FieldCodecError('invalid_shape', message);
}
