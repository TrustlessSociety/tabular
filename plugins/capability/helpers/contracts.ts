import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { IdentityCapability } from '../../identity/helpers/contracts.js';
import type {
  CapabilityAction,
  CellPatch,
  SafeActionError,
  TypedCellValue,
  ValidationIssue
} from './action-contracts.js';

export type {
  ActionFailure,
  ActionResult,
  ActionSuccess,
  CapabilityAction,
  CellPatch,
  NullCellValue,
  SafeActionError,
  SafeActionErrorCode,
  SafeDraft,
  SafeJournalEntry,
  TypedCellValue,
  ValidationIssue
} from './action-contracts.js';

export type PreparedTarget = {
  fileId: string;
  schemaVersion: string;
  state: unknown;
};

export type TargetReadResult = {
  rowId: string;
  version: string;
  cells: CellPatch[];
};

export type TargetMutationRow = {
  rowId?: string;
  expectedVersion?: string;
  expectedIncarnation?: string;
  patch: CellPatch[];
  preconditions?: CellPatch[];
  operation?: 'insert' | 'update' | 'delete';
  insertRank?: string;
};

export type AppliedCellChange = {
  rowId: string;
  columnId: string;
  before: TypedCellValue;
  after: TypedCellValue;
};

export type TargetMutationEffect = {
  rows: Array<{
    rowId: string;
    operation: 'insert' | 'update' | 'delete';
    priorVersion: string;
    resultingVersion: string;
    incarnation: string;
  }>;
  changes: AppliedCellChange[];
};

export type TargetCapabilityDescriptor = {
  fileId: string;
  schemaVersion: string;
  columns: Array<{
    columnId: string;
    codec: 'text' | 'integer' | 'decimal' | 'boolean' | 'date'
      | 'time' | 'timestamp' | 'json';
    editable: boolean;
    key: boolean;
    generated: boolean;
  }>;
  operations: {
    update: boolean;
    insert: boolean;
    delete: boolean;
  };
};

export interface CapabilityTargetAdapter {
  readonly name: string;
  prepare(
    database: DatabaseExecutor,
    fileId: string,
    connectionId?: string
  ): Promise<PreparedTarget | undefined>;
  validatePatch(target: PreparedTarget, patch: CellPatch[]): Promise<ValidationIssue[]>;
  authorize(
    database: DatabaseExecutor,
    target: PreparedTarget,
    operation: 'read' | 'mutate'
  ): Promise<void>;
  describe(
    database: DatabaseExecutor,
    target: PreparedTarget
  ): Promise<TargetCapabilityDescriptor>;
  read(
    database: DatabaseExecutor,
    target: PreparedTarget,
    rowId: string,
    columnIds: string[],
    maximumResultBytes?: number
  ): Promise<TargetReadResult | undefined>;
  mutate(
    database: DatabaseExecutor,
    target: PreparedTarget,
    rows: TargetMutationRow[]
  ): Promise<TargetMutationEffect>;
}

export type AuthorityPhases<TargetResult, FinalResult = TargetResult> = {
  prepareBase?: (database: DatabaseExecutor) => Promise<void>;
  target: (database: DatabaseExecutor) => Promise<TargetResult>;
  finalizeBase?: (database: DatabaseExecutor, result: TargetResult) => Promise<FinalResult>;
};

export abstract class AuthorizedExecutionContext {
  abstract readonly surface: 'web' | 'mcp';
  readonly actorIdentityId: string;
  readonly sessionId: string;
  readonly historyScopeId: string;
  readonly connectionId: string;
  readonly expiresAt: Date;

  protected constructor(input: {
    actorIdentityId: string;
    sessionId: string;
    historyScopeId: string;
    connectionId: string;
    expiresAt: Date;
  }) {
    this.actorIdentityId = input.actorIdentityId;
    this.sessionId = input.sessionId;
    this.historyScopeId = input.historyScopeId;
    this.connectionId = input.connectionId;
    this.expiresAt = input.expiresAt;
  }

  abstract transaction<TargetResult, FinalResult = TargetResult>(
    capability: IdentityCapability,
    phases: AuthorityPhases<TargetResult, FinalResult>
  ): Promise<FinalResult>;

  readTransaction<TargetResult>(phases: AuthorityPhases<TargetResult>) {
    return this.transaction('tabular.capability', phases);
  }

  abstract allows(action: CapabilityAction): boolean;
}

export abstract class McpAuthorizedExecutionContext extends AuthorizedExecutionContext {
  readonly surface = 'mcp' as const;
}

export class ActionFault extends Error {
  constructor(readonly safe: SafeActionError) {
    super(safe.message);
    this.name = 'ActionFault';
  }
}

/** Internal caller-supplied output budget. It is mapped only by the owning
 * transport and never exposes query or PostgreSQL details. */
export class CapabilityResultBudgetExceededError extends Error {
  constructor() {
    super('The capability result exceeded its transport budget');
    this.name = 'CapabilityResultBudgetExceededError';
  }
}

/** Internal execution constraints supplied by an owning transport. They are
 * deliberately separate from the validated public action payload. */
export type CapabilityExecutionOptions = {
  maximumResultBytes?: number;
};
