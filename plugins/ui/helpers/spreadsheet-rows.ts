import type { GridRow } from '../../grid/helpers/contracts.js';

/**
 * Places ranked rows into their logical spreadsheet slots before filling the
 * remaining slots with ordinary PostgreSQL rows. A later draft may therefore
 * occupy row 19 even when a row-20 draft was loaded first.
 */
export function padSpreadsheetRows(
  rows: GridRow[],
  ranks: Record<string, string>,
  blankRows: GridRow[]
) {
  const length = Math.max(blankRows.length, rows.length);
  const slots = Array<GridRow | undefined>(length).fill(undefined);
  const ranked: Array<{ row: GridRow; logical: number; order: number }> = [];
  const ordinary: GridRow[] = [];

  rows.forEach((row, order) => {
    const logical = ranks[row.id] ? logicalRowFromHiddenRank(ranks[row.id]!) : undefined;
    if (logical) ranked.push({ row, logical, order });
    else ordinary.push(row);
  });

  ranked.sort((left, right) => left.logical - right.logical || left.order - right.order);
  for (const { row, logical } of ranked) {
    let target = logical - 1;
    while (target < slots.length && slots[target]) target += 1;
    if (target >= slots.length) slots.push(row);
    else slots[target] = row;
  }

  let cursor = 0;
  for (const row of ordinary) {
    while (cursor < slots.length && slots[cursor]) cursor += 1;
    if (cursor >= slots.length) slots.push(row);
    else slots[cursor] = row;
    cursor += 1;
  }

  return slots.map((row, index) => row || blankRows[index] || {
    id: `placeholder_row_${index + 1}`
  });
}

/** Decodes the integer spreadsheet position stored in a hidden rank. */
function logicalRowFromHiddenRank(rank: string) {
  if (!/^[0-9]{24}$/.test(rank)) return undefined;
  const value = BigInt(rank);
  if (value % 1_000_000n !== 0n) return undefined;
  const logical = Number(value / 1_000_000n);
  return Number.isSafeInteger(logical) && logical >= 1 ? logical : undefined;
}
