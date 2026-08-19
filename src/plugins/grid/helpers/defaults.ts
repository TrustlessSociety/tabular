//client
import type { GridCellValue, GridColumn } from './contracts.js';
import { canonicalJsonValue } from '../../capability/helpers/value-contracts.js';

/**
 * Project a PostgreSQL literal default into the editable grid value domain.
 */
export function literalGridDefault(
  expression: string | null,
  storageType: string
): GridCellValue | undefined {
  if (expression === null) return undefined;
  const source = expression.trim();

  //boolean defaults are emitted without quotes by the owned DDL compiler
  if (storageType === 'boolean') {
    if (/^(?:true|'(?:true|t)'::boolean)$/i.test(source)) return true;
    if (/^(?:false|'(?:false|f)'::boolean)$/i.test(source)) return false;
    return undefined;
  }

  //owned string-like and exact numeric literals use a quoted PostgreSQL cast
  const quoted = /^'((?:[^']|'')*)'(?:::[A-Za-z][A-Za-z0-9_ ]*)?$/.exec(source);
  if (quoted) {
    const value = quoted[1]!.replaceAll("''", "'");
    return storageType === 'jsonb' ? canonicalJsonValue(value) : value;
  }

  //also accept normalized bare numeric catalog expressions without coercing
  // them through JavaScript's lossy number representation
  if (
    (storageType === 'bigint' || storageType === 'numeric')
    && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:::(?:bigint|numeric))?$/.test(source)
  ) {
    return source.replace(/::(?:bigint|numeric)$/, '');
  }
  return undefined;
}

/**
 * Apply a known literal default only when one field editor exits empty.
 */
export function valueAfterFieldExit(
  column: GridColumn,
  attempted: GridCellValue
): GridCellValue {
  const isEmpty = attempted === null || attempted === '';
  return isEmpty && typeof column.defaultValue !== 'undefined'
    ? column.defaultValue
    : attempted;
}
