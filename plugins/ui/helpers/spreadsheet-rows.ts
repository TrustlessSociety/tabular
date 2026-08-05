import type { GridRow } from '../../grid/helpers/contracts.js';

const ROW_RANK_GAP = 1_000_000n;
const MAX_ROW_RANK = 10n ** 24n - 1n;

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
  const ranked: Array<{ row: GridRow; rank: bigint; preferred?: number; order: number }> = [];
  const ordinary: GridRow[] = [];

  rows.forEach((row, order) => {
    const placement = ranks[row.id]
      ? placementFromHiddenRank(ranks[row.id]!, slots.length)
      : undefined;
    if (placement) ranked.push({ row, ...placement, order });
    else ordinary.push(row);
  });

  ranked.sort((left, right) => (
    left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : left.order - right.order
  ));
  let rankedCursor = 0;
  for (const { row, preferred } of ranked) {
    let target = Math.max(rankedCursor, preferred ?? rankedCursor);
    while (target < slots.length && slots[target]) target += 1;
    if (target >= slots.length) slots.push(row);
    else slots[target] = row;
    rankedCursor = target + 1;
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

/**
 * Keeps the committed-row authority from the server snapshot while deriving
 * boundary order from the rows the user can currently see. This matters after
 * shared ranks reorder the sheet and when retained insert drafts occupy a
 * visible row without becoming committed records.
 */
export function committedRowIdsInVisibleOrder(
  visibleRows: GridRow[],
  committedRows: GridRow[]
) {
  const committed = new Set(committedRows.map((row) => row.id));
  return visibleRows
    .filter((row) => committed.has(row.id))
    .map((row) => row.id);
}

/** Allocates a stable rank between the visible rows around one insertion. */
export function rankForInsertedRow(
  visibleRows: GridRow[],
  ranks: Record<string, string>,
  insertAt: number
) {
  const before = ranks[visibleRows[insertAt - 1]?.id || ''];
  const after = ranks[visibleRows[insertAt]?.id || ''];
  const rankedBefore = validRank(before) ? BigInt(before) : undefined;
  const rankedAfter = validRank(after) ? BigInt(after) : undefined;
  let lower: bigint;
  let upper: bigint;
  let candidate: bigint;

  if (insertAt === 0 && rankedAfter !== undefined) {
    lower = 0n;
    upper = rankedAfter;
    candidate = upper / 2n;
  } else if (insertAt >= visibleRows.length && rankedBefore !== undefined) {
    lower = rankedBefore;
    upper = MAX_ROW_RANK;
    candidate = lower + ROW_RANK_GAP;
  } else if (rankedBefore !== undefined && rankedAfter !== undefined) {
    lower = rankedBefore;
    upper = rankedAfter;
    candidate = lower + (upper - lower) / 2n;
  } else if (rankedBefore !== undefined) {
    lower = rankedBefore;
    upper = maxRank(BigInt(insertAt + 2) * ROW_RANK_GAP, lower + ROW_RANK_GAP);
    candidate = lower + (upper - lower) / 2n;
  } else if (rankedAfter !== undefined) {
    upper = rankedAfter;
    lower = minRank(
      BigInt(insertAt) * ROW_RANK_GAP,
      upper > ROW_RANK_GAP ? upper - ROW_RANK_GAP : 0n
    );
    candidate = lower + (upper - lower) / 2n;
  } else {
    lower = BigInt(insertAt) * ROW_RANK_GAP;
    upper = BigInt(insertAt + 2) * ROW_RANK_GAP;
    candidate = BigInt(insertAt + 1) * ROW_RANK_GAP;
  }
  if (candidate <= lower || candidate >= upper || candidate >= MAX_ROW_RANK) {
    throw new Error('Reload before inserting another row at this position');
  }
  return candidate.toString().padStart(24, '0');
}

function minRank(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function maxRank(left: bigint, right: bigint) {
  return left > right ? left : right;
}

/** Decodes ordering plus the nearest bounded spreadsheet slot from a rank. */
function placementFromHiddenRank(rank: string, slotLimit: number) {
  if (!validRank(rank)) return undefined;
  const value = BigInt(rank);
  const logical = value / 1_000_000n;
  const preferred = logical > 0n ? logical - 1n : 0n;
  return {
    rank: value,
    ...(preferred < BigInt(slotLimit) ? { preferred: Number(preferred) } : {})
  };
}

/** Narrows one optional rank token to the fixed-width PostgreSQL contract. */
function validRank(rank: string | undefined): rank is string {
  return Boolean(rank && /^[0-9]{24}$/.test(rank));
}
