//client
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

//The prepared target contract exported for module callers
export type PreparedTarget = {
  fileId: string,
  schemaVersion: string,
  state: unknown,
};

//The target read result contract exported for module callers
export type TargetReadResult = {
  rowId: string,
  version: string,
  cells: CellPatch[],
};

//The target mutation row contract exported for module callers
export type TargetMutationRow = {
  rowId?: string,
  expectedVersion?: string,
  expectedIncarnation?: string,
  patch: CellPatch[],
  preconditions?: CellPatch[],
  operation?: 'insert' | 'update' | 'delete',
  insertRank?: string,
};

//The applied cell change contract exported for module callers
export type AppliedCellChange = {
  rowId: string,
  columnId: string,
  before: TypedCellValue,
  after: TypedCellValue,
};

//The target mutation effect contract exported for module callers
export type TargetMutationEffect = {
  rows: Array<{
    rowId: string,
    operation: 'insert' | 'update' | 'delete',
    priorVersion: string,
    resultingVersion: string,
    incarnation: string,
  }>,
  changes: AppliedCellChange[],
};

//The target capability descriptor contract exported for module callers
export type TargetCapabilityDescriptor = {
  fileId: string,
  schemaVersion: string,
  columns: Array<{
    columnId: string,
    codec: 'text' | 'integer' | 'decimal' | 'boolean' | 'date'
      | 'time' | 'timestamp' | 'json',
    editable: boolean,
    key: boolean,
    generated: boolean,
  }>,
  operations: {
    update: boolean,
    insert: boolean,
    delete: boolean,
  },
};

//The capability target adapter contract exported for module callers
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

//The authority phases contract exported for module callers
export type AuthorityPhases<TargetResult, FinalResult = TargetResult> = {
  prepareBase?: (database: DatabaseExecutor) => Promise<void>,
  target: (database: DatabaseExecutor) => Promise<TargetResult>,
  finalizeBase?: (database: DatabaseExecutor, result: TargetResult) => Promise<FinalResult>,
};

/**
 * Provide the authorized execution context behavior used by this module.
 */
export abstract class AuthorizedExecutionContext {
  //The surface state retained by this class instance
  public abstract readonly surface: 'web' | 'mcp';
  //The actor identity id state retained by this class instance
  public readonly actorIdentityId: string;
  //The session id state retained by this class instance
  public readonly sessionId: string;
  //The history scope id state retained by this class instance
  public readonly historyScopeId: string;
  //The connection id state retained by this class instance
  public readonly connectionId: string;
  //The expires at state retained by this class instance
  public readonly expiresAt: Date;

  /**
   * Create a AuthorizedExecutionContext instance.
   */
  protected constructor(input: {
    actorIdentityId: string,
    sessionId: string,
    historyScopeId: string,
    connectionId: string,
    expiresAt: Date,
  }) {
    this.actorIdentityId = input.actorIdentityId;
    this.sessionId = input.sessionId;
    this.historyScopeId = input.historyScopeId;
    this.connectionId = input.connectionId;
    this.expiresAt = input.expiresAt;
  }

  /**
   * Handle the transaction operation.
   */
  public abstract transaction<TargetResult, FinalResult = TargetResult>(
    capability: IdentityCapability,
    phases: AuthorityPhases<TargetResult, FinalResult>
  ): Promise<FinalResult>;

  /**
   * Read the transaction.
   */
  public readTransaction<TargetResult>(phases: AuthorityPhases<TargetResult>) {
    return this.transaction('tabular.capability', phases);
  }

  /**
   * Handle the allows operation.
   */
  public abstract allows(action: CapabilityAction): boolean;
}

/**
 * Provide the mcp authorized execution context behavior used by this module.
 */
export abstract class McpAuthorizedExecutionContext extends AuthorizedExecutionContext {
  //The surface state retained by this class instance
  public readonly surface = 'mcp' as const;
}

/**
 * Provide the action fault behavior used by this module.
 */
export class ActionFault extends Error {
  /**
   * Create a ActionFault instance.
   */
  public constructor(public readonly safe: SafeActionError) {
    super(safe.message);
    this.name = 'ActionFault';
  }
}

/**
 * Internal caller-supplied output budget. It is mapped only by the owning
 * transport and never exposes query or PostgreSQL details.
 */
export class CapabilityResultBudgetExceededError extends Error {
  /**
   * Create a CapabilityResultBudgetExceededError instance.
   */
  public constructor() {
    super('The capability result exceeded its transport budget');
    this.name = 'CapabilityResultBudgetExceededError';
  }
}

/**
 * Internal execution constraints supplied by an owning transport. They are
 * deliberately separate from the validated public action payload.
 */
export type CapabilityExecutionOptions = {
  maximumResultBytes?: number,
};
