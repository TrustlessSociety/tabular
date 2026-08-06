//client
import type { GridCellIssue, GridRow } from '../../grid/helpers/contracts.js';
import type { GridEditDraft } from '../../grid/helpers/editing.js';

/**
 * A schema-change issue describes the retained draft envelope, not the typed
 * cell value. Remove only that issue before validating the same values against
 * the live schema; genuine field issues remain blocking.
 */
export function draftForSchemaRevalidation(draft: GridEditDraft): GridEditDraft {
  return {
    ...draft,
    changes: draft.changes.map((change) => change.issue?.code === 'schema_changed'
      ? { ...change, issue: undefined }
      : change)
  };
}

/**
 * Return the project draft cell issues result.
 */
export function projectDraftCellIssues(
  draft: GridEditDraft,
  state: 'none' | 'pending' | 'invalid' | 'failed' | 'stale'
): GridCellIssue[] {
  if (state !== 'invalid' && state !== 'failed') return [];
  const explicitIssues = draft.changes.filter((change) => change.issue);
  const projected = state === 'failed' || !explicitIssues.length
    ? draft.changes
    : explicitIssues;
  return projected.map((change) => {
    //A retained insert can carry validation for untouched required siblings.
    // Keep those blank cells ordinary, but let a non-empty rejected value use
    // the familiar spreadsheet token while its raw input stays in the draft.
    const showInsertToken = Boolean(change.issue && change.raw.trim());
    return {
      rowId: change.point.rowId,
      columnId: change.point.columnId,
      token: state === 'failed' ? '#ERROR!' as const : '#VALUE!' as const,
      ...(draft.kind === 'insert' ? { showCellToken: showInsertToken } : {}),
      message: change.issue?.message || (state === 'failed'
        ? 'PostgreSQL did not accept this change; the raw draft is retained.'
        : 'This value needs correction before the row can be accepted.')
    };
  });
}

/**
 * Attaches server validation to the exact changed cells when possible.
 */
export function applyServerDraftIssues(
  draft: GridEditDraft,
  issues: readonly unknown[] | undefined
): GridEditDraft {
  const typedIssues = issues?.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const issue = candidate as { columnId?: unknown, code?: unknown, message?: unknown, };
    if (typeof issue.code !== 'string' || typeof issue.message !== 'string') return [];
    return [{
      ...(typeof issue.columnId === 'string' ? { columnId: issue.columnId } : {}),
      code: issue.code,
      message: issue.message
    }];
  }) || [];
  if (!typedIssues.length) return draft;
  const byColumn = new Map(typedIssues.flatMap((issue) =>
    issue.columnId ? [[issue.columnId, issue] as const] : []
  ));
  const rowIssue = typedIssues.find((issue) => !issue.columnId);
  let rowIssueApplied = false;
  return {
    ...draft,
    changes: draft.changes.map((change) => {
      const issue = byColumn.get(change.point.columnId)
        || (!rowIssueApplied ? rowIssue : undefined);
      if (!issue) return change;
      rowIssueApplied = rowIssueApplied || issue === rowIssue;
      return { ...change, issue };
    })
  };
}

/**
 * Finds target cells that changed to an unexpected value after this draft
 * started. A cell already holding either the original or intended value is
 * safe to retry against a freshly read PostgreSQL row version.
 */
export function conflictingDraftTargets(
  draft: GridEditDraft,
  rows: GridRow[]
) {
  if (draft.kind !== 'cells') return draft.changes;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return draft.changes.filter((change) => {
    const row = byId.get(change.point.rowId);
    if (!row) return true;
    const current = row[change.point.columnId] ?? null;
    return !Object.is(current, change.before) && !Object.is(current, change.after);
  });
}
