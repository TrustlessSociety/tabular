export type NullCellValue = { type: 'null' };

export type TypedCellValue =
  | NullCellValue
  | { type: 'text'; value: string }
  | { type: 'integer'; value: string }
  | { type: 'decimal'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'date'; value: string }
  | { type: 'time'; value: string }
  | { type: 'timestamp'; value: string }
  | { type: 'json'; value: string };

export type CellPatch = {
  columnId: string;
  value: TypedCellValue;
};

export type ValidationIssue = {
  columnId?: string;
  code: string;
  message: string;
};

type CommandAction = {
  commandId: string;
};

export type CapabilityAction =
  | {
    type: 'record.read';
    fileId: string;
    rowId: string;
    columnIds: string[];
  }
  | (CommandAction & {
    type: 'record.patch';
    fileId: string;
    rowId: string;
    expectedVersion: string;
    patch: CellPatch[];
  })
  | (CommandAction & {
    type: 'record.insert';
    fileId: string;
    patch: CellPatch[];
  })
  | (CommandAction & {
    type: 'record.delete';
    fileId: string;
    rowId: string;
    expectedVersion: string;
  })
  | (CommandAction & {
    type: 'range.patch';
    fileId: string;
    cellCount: number;
    rows: Array<{
      rowId: string;
      expectedVersion: string;
      patch: CellPatch[];
    }>;
  })
  | (CommandAction & {
    type: 'draft.create';
    fileId: string;
    rowId?: string;
    rowRank?: string;
    schemaVersion: string;
    patch: CellPatch[];
    expiresAt: string;
  })
  | {
    type: 'draft.read';
    draftId: string;
  }
  | {
    type: 'draft.list';
    fileId: string;
  }
  | (CommandAction & {
    type: 'draft.update';
    draftId: string;
    expectedDraftVersion: number;
    patch: CellPatch[];
  })
  | (CommandAction & {
    type: 'draft.delete';
    draftId: string;
    expectedDraftVersion: number;
  })
  | (CommandAction & {
    type: 'draft.promote';
    draftId: string;
    expectedDraftVersion: number;
    expectedRowVersion?: string;
  })
  | {
    type: 'history.list';
    fileId: string;
    limit: number;
  }
  | (CommandAction & {
    type: 'history.undo' | 'history.redo';
    fileId?: string;
  });

export type SafeActionErrorCode =
  | 'invalid_action'
  | 'capability_denied'
  | 'not_found'
  | 'conflict'
  | 'retryable_conflict'
  | 'result_too_large'
  | 'validation_failed'
  | 'schema_changed'
  | 'history_not_available'
  | 'action_failed';

export type SafeActionError = {
  code: SafeActionErrorCode;
  message: string;
  retryable: boolean;
  issues?: ValidationIssue[];
};

export type ActionSuccess<Value = unknown> = {
  ok: true;
  value: Value;
};

export type ActionFailure = {
  ok: false;
  error: SafeActionError;
};

export type ActionResult<Value = unknown> = ActionSuccess<Value> | ActionFailure;

export type SafeDraft = {
  id: string;
  fileId: string;
  rowId?: string;
  rowRank?: string;
  schemaVersion: string;
  patch: CellPatch[];
  validation: ValidationIssue[];
  version: number;
  state: 'active' | 'expired' | 'promoted' | 'abandoned';
  expiresAt: string;
};

export type SafeJournalEntry = {
  id: string;
  fileId: string;
  actionType:
    | 'record.patch'
    | 'record.insert'
    | 'record.delete'
    | 'range.patch'
    | 'draft.promote'
    | 'draft.create'
    | 'draft.update'
    | 'draft.delete'
    | 'history.undo'
    | 'history.redo';
  affectedRowCount: number;
  affectedCellCount: number;
  createdAt: string;
  reversalAvailable: 'undo' | 'redo' | 'none';
};
