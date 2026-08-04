import { createHash } from 'node:crypto';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import { opaqueId } from '../../identity/helpers/security.js';
import {
  ActionFault,
  CapabilityResultBudgetExceededError,
  AuthorizedExecutionContext,
  type ActionResult,
  type AppliedCellChange,
  type CapabilityAction,
  type CapabilityExecutionOptions,
  type CapabilityTargetAdapter,
  type CellPatch,
  type PreparedTarget,
  type SafeActionError,
  type TargetMutationEffect,
  type TargetMutationRow,
  type ValidationIssue
} from './contracts.js';
import {
  CapabilityRepository,
  safeDraft,
  type DraftRecord,
  type JournalReplay,
  type SessionHistoryEntry
} from './repository.js';
import { validateAction } from './validation.js';
import {
  RegisteredPostgreSqlTargetAdapter,
  type PostgreSqlTargetDefinition,
  type PostgreSqlBrowseResult
} from './postgresql-target.js';
import { CatalogPostgreSqlTargetAdapter } from './catalog-postgresql-target.js';
import type { GridFilter, GridSort } from '../../grid/helpers/contracts.js';
import {
  commitImportedTable,
  type CapabilityImportCommit
} from './import-commit.js';

export type GridTargetPlan = {
  adapter: RegisteredPostgreSqlTargetAdapter | CatalogPostgreSqlTargetAdapter;
  target: PreparedTarget;
};

export type GridQueryInput = {
  columnIds: string[];
  sorts: GridSort[];
  filters: GridFilter[];
  limit: number;
  maximumResultBytes?: number;
};

export const CAPABILITY_SERVICE = 'tabular.capability';

type TargetPlan = {
  adapter: CapabilityTargetAdapter;
  target: PreparedTarget;
};

type MutationAttempt =
  | { kind: 'effect'; effect: TargetMutationEffect }
  | { kind: 'failure'; error: SafeActionError };

type IdempotentAttempt = MutationAttempt | { kind: 'replay'; replay: JournalReplay };
type DraftCommandAttempt = { kind: 'ready' } | { kind: 'replay'; replay: JournalReplay };

export class CapabilityPluginService {
  readonly name = CAPABILITY_SERVICE;
  readonly #targets: CapabilityTargetAdapter[] = [];
  readonly postgresqlTargets = new RegisteredPostgreSqlTargetAdapter();
  readonly catalogPostgresqlTargets = new CatalogPostgreSqlTargetAdapter();

  constructor() {
    this.registerTargetAdapter(this.catalogPostgresqlTargets);
    this.registerTargetAdapter(this.postgresqlTargets);
  }

  registerPostgreSqlTarget(definition: PostgreSqlTargetDefinition) {
    this.postgresqlTargets.register(definition);
  }

  registerTargetAdapter(adapter: CapabilityTargetAdapter) {
    if (!adapter || typeof adapter.name !== 'string' || !adapter.name) {
      throw new Error('A named capability target adapter is required');
    }
    if (this.#targets.some((registered) => registered.name === adapter.name)) {
      throw new Error(`Capability target adapter already registered: ${adapter.name}`);
    }
    this.#targets.push(adapter);
  }

  async prepareGridTarget(
    database: DatabaseExecutor,
    fileId: string,
    connectionId: string
  ): Promise<GridTargetPlan | undefined> {
    for (const adapter of [this.postgresqlTargets, this.catalogPostgresqlTargets]) {
      const target = await adapter.prepare(database, fileId, connectionId);
      if (target) return { adapter, target };
    }
    return undefined;
  }

  browseGridTarget(
    database: DatabaseExecutor,
    plan: GridTargetPlan,
    limit = 1_000
  ): Promise<PostgreSqlBrowseResult> {
    return plan.adapter.browse(database, plan.target, limit);
  }

  describeGridTarget(database: DatabaseExecutor, plan: GridTargetPlan) {
    return plan.adapter.describe(database, plan.target);
  }

  queryGridTarget(
    database: DatabaseExecutor,
    plan: GridTargetPlan,
    input: GridQueryInput
  ): Promise<PostgreSqlBrowseResult> {
    if (!(plan.adapter instanceof CatalogPostgreSqlTargetAdapter)) {
      throw new ActionFault({
        code: 'capability_denied',
        message: 'Authorized filtered export is unavailable for this target',
        retryable: false
      });
    }
    return plan.adapter.query(database, plan.target, input);
  }

  commitImportTable(
    database: DatabaseExecutor,
    input: CapabilityImportCommit
  ) {
    return commitImportedTable(database, input);
  }

  moveGridRow(
    database: DatabaseExecutor,
    plan: GridTargetPlan,
    input: { rowId: string; beforeRowId?: string; afterRowId?: string }
  ) {
    if (!(plan.adapter instanceof CatalogPostgreSqlTargetAdapter)) {
      throw new ActionFault({
        code: 'capability_denied',
        message: 'Shared row order is unavailable for this target',
        retryable: false
      });
    }
    return plan.adapter.moveRow(database, plan.target, input);
  }

  async execute(
    context: AuthorizedExecutionContext,
    input: unknown,
    options: CapabilityExecutionOptions = {}
  ): Promise<ActionResult> {
    try {
      if (!(context instanceof AuthorizedExecutionContext)) {
        throw new ActionFault({
          code: 'capability_denied',
          message: 'The requested capability is denied',
          retryable: false
        });
      }
      const action = validateAction(input as CapabilityAction);
      if (!context.allows(action)) {
        throw new ActionFault({
          code: 'capability_denied',
          message: 'The requested capability is denied',
          retryable: false
        });
      }
      const maximumResultBytes = resultBudget(options.maximumResultBytes);
      const value = await this.dispatch(context, action, maximumResultBytes);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  }

  private dispatch(
    context: AuthorizedExecutionContext,
    action: CapabilityAction,
    maximumResultBytes?: number
  ) {
    switch (action.type) {
      case 'record.read': return this.readRecord(context, action, maximumResultBytes);
      case 'record.patch': return this.patchRecord(context, action);
      case 'record.insert': return this.insertRecord(context, action);
      case 'record.delete': return this.deleteRecord(context, action);
      case 'range.patch': return this.patchRange(context, action);
      case 'draft.create': return this.createDraft(context, action);
      case 'draft.read': return this.readDraft(context, action, maximumResultBytes);
      case 'draft.list': return this.listDrafts(context, action, maximumResultBytes);
      case 'draft.update': return this.updateDraft(context, action);
      case 'draft.delete': return this.deleteDraft(context, action);
      case 'draft.promote': return this.promoteDraft(context, action);
      case 'history.list': return this.listHistory(context, action, maximumResultBytes);
      case 'history.undo': return this.reverseHistory(context, action, 'undo');
      case 'history.redo': return this.reverseHistory(context, action, 'redo');
    }
  }

  private async readRecord(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'record.read' }>,
    maximumResultBytes?: number
  ) {
    let plan: TargetPlan | undefined;
    return context.readTransaction({
      prepareBase: async (database) => {
        plan = await this.prepareTarget(database, action.fileId, context.connectionId);
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'read');
        const row = await current.adapter.read(
          database,
          current.target,
          action.rowId,
          action.columnIds,
          maximumResultBytes
        );
        if (!row) notFound();
        return row;
      }
    });
  }

  private async listDrafts(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'draft.list' }>,
    maximumResultBytes?: number
  ) {
    let plan: TargetPlan | undefined;
    let drafts: Awaited<ReturnType<CapabilityRepository['listActiveDrafts']>> = [];
    return context.readTransaction({
      prepareBase: async (database) => {
        plan = await this.prepareTarget(database, action.fileId, context.connectionId);
        drafts = await new CapabilityRepository(database).listActiveDrafts(
          context,
          action.fileId,
          maximumResultBytes
        );
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'read');
        return drafts;
      }
    });
  }

  private patchRecord(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'record.patch' }>
  ) {
    return this.forwardMutation(context, action, [{
      rowId: action.rowId,
      expectedVersion: action.expectedVersion,
      patch: action.patch
    }]);
  }

  private patchRange(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'range.patch' }>
  ) {
    return this.forwardMutation(context, action, action.rows);
  }

  private insertRecord(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'record.insert' }>
  ) {
    return this.forwardMutation(context, action, [{
      operation: 'insert',
      patch: action.patch
    }]);
  }

  private deleteRecord(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'record.delete' }>
  ) {
    return this.forwardMutation(context, action, [{
      operation: 'delete',
      rowId: action.rowId,
      expectedVersion: action.expectedVersion,
      patch: []
    }]);
  }

  private async forwardMutation(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, {
      type: 'record.patch' | 'record.insert' | 'record.delete' | 'range.patch'
    }>,
    rows: TargetMutationRow[]
  ) {
    const digest = actionDigest(action);
    const actionId = opaqueId('act');
    let plan: TargetPlan | undefined;
    let replay: JournalReplay | undefined;
    let issues: ValidationIssue[] = [];
    const result = await context.transaction<IdempotentAttempt>('tabular.capability', {
      prepareBase: async (database) => {
        const repository = new CapabilityRepository(database);
        await repository.lockCommand(context, action.commandId);
        replay = await repository.journalReplay(context, action.commandId);
        if (replay && replay.request_digest !== digest) idempotencyConflict();
        plan = await this.prepareTarget(
          database,
          replay?.file_id || action.fileId,
          context.connectionId
        );
        if (!replay) {
          issues = (await Promise.all(rows.map((row) =>
            plan!.adapter.validatePatch(plan!.target, row.patch)
          ))).flat();
        }
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'mutate');
        if (replay) return { kind: 'replay', replay };
        if (issues.length) return validationAttempt(issues);
        return runMutation(database, () => current.adapter.mutate(
          database,
          current.target,
          deterministicRows(rows)
        ));
      },
      finalizeBase: async (database, attempt) => {
        if (attempt.kind !== 'effect') return attempt;
        const summary = mutationSummary(actionId, attempt.effect, false);
        await new CapabilityRepository(database).insertCommittedAction({
          scope: context,
          id: actionId,
          commandId: action.commandId,
          requestDigest: digest,
          fileId: action.fileId,
          actionType: action.type,
          schemaVersion: required(plan, 'Target plan was not prepared').target.schemaVersion,
          effect: attempt.effect,
          resultSummary: summary
        });
        return attempt;
      }
    });
    if (result.kind === 'failure') throw new ActionFault(result.error);
    if (result.kind === 'replay') return { ...result.replay.result_summary, replayed: true };
    return mutationSummary(actionId, result.effect, false);
  }

  private async createDraft(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'draft.create' }>
  ) {
    const digest = actionDigest(action);
    const actionId = opaqueId('act');
    const draftId = opaqueId('draft');
    const expiresAt = boundedDraftExpiry(action.expiresAt);
    let plan: TargetPlan | undefined;
    let replay: JournalReplay | undefined;
    let issues: ValidationIssue[] = [];
    return context.transaction<DraftCommandAttempt, Record<string, unknown>>('tabular.capability', {
      prepareBase: async (database) => {
        const repository = new CapabilityRepository(database);
        await repository.lockCommand(context, action.commandId);
        replay = await repository.journalReplay(context, action.commandId);
        if (replay && replay.request_digest !== digest) idempotencyConflict();
        plan = await this.prepareTarget(
          database,
          replay?.file_id || action.fileId,
          context.connectionId
        );
        if (replay) return;
        issues = await plan.adapter.validatePatch(plan.target, action.patch);
        if (plan.target.schemaVersion !== action.schemaVersion) {
          issues = [...issues, schemaIssue()];
        }
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'mutate');
        return replay ? { kind: 'replay', replay } : { kind: 'ready' };
      },
      finalizeBase: async (database, attempt) => {
        if (attempt.kind === 'replay') {
          return { ...attempt.replay.result_summary, replayed: true };
        }
        const repository = new CapabilityRepository(database);
        const draft = await repository.createDraft({
          scope: context,
          id: draftId,
          fileId: action.fileId,
          rowId: action.rowId,
          rowRank: action.rowRank,
          schemaVersion: action.schemaVersion,
          patch: action.patch,
          validation: issues,
          expiresAt
        });
        const summary = draftSummary(draft, false);
        await repository.insertDraftAction({
          scope: context,
          id: actionId,
          commandId: action.commandId,
          requestDigest: digest,
          fileId: action.fileId,
          actionType: 'draft.create',
          schemaVersion: action.schemaVersion,
          affectedCellCount: action.patch.length,
          resultSummary: summary
        });
        return summary;
      }
    });
  }

  private async readDraft(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'draft.read' }>,
    maximumResultBytes?: number
  ) {
    let draft: DraftRecord | undefined;
    let plan: TargetPlan | undefined;
    return context.readTransaction({
      prepareBase: async (database) => {
        const repository = new CapabilityRepository(database);
        draft = await repository.draftForUpdate(
          context,
          action.draftId,
          maximumResultBytes
        );
        if (!draft) notFound();
        plan = await this.prepareTarget(database, draft.file_id, context.connectionId);
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'read');
        return safeDraft(required(draft, 'Draft was not prepared'));
      }
    });
  }

  private async updateDraft(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'draft.update' }>
  ) {
    const digest = actionDigest(action);
    const actionId = opaqueId('act');
    let draft: DraftRecord | undefined;
    let plan: TargetPlan | undefined;
    let replay: JournalReplay | undefined;
    let merged: CellPatch[] = [];
    let issues: ValidationIssue[] = [];
    return context.transaction<DraftCommandAttempt, Record<string, unknown>>('tabular.capability', {
      prepareBase: async (database) => {
        const repository = new CapabilityRepository(database);
        await repository.lockCommand(context, action.commandId);
        replay = await repository.journalReplay(context, action.commandId);
        if (replay && replay.request_digest !== digest) idempotencyConflict();
        if (replay) {
          plan = await this.prepareTarget(database, replay.file_id, context.connectionId);
          return;
        }
        draft = await repository.draftForUpdate(context, action.draftId);
        assertEditableDraft(draft, action.expectedDraftVersion);
        plan = await this.prepareTarget(database, draft!.file_id, context.connectionId);
        merged = mergePatch(draft!.patch, action.patch);
        issues = await plan.adapter.validatePatch(plan.target, merged);
        if (plan.target.schemaVersion !== draft!.schema_version) issues = [...issues, schemaIssue()];
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'mutate');
        return replay ? { kind: 'replay', replay } : { kind: 'ready' };
      },
      finalizeBase: async (database, attempt) => {
        if (attempt.kind === 'replay') {
          return { ...attempt.replay.result_summary, replayed: true };
        }
        const repository = new CapabilityRepository(database);
        const updated = await repository.updateDraft(
          context,
          action.draftId,
          action.expectedDraftVersion,
          merged,
          issues
        );
        if (!updated) conflict('The draft changed before the update was committed');
        const summary = draftSummary(updated, false);
        await repository.insertDraftAction({
          scope: context,
          id: actionId,
          commandId: action.commandId,
          requestDigest: digest,
          fileId: updated.fileId,
          actionType: 'draft.update',
          schemaVersion: updated.schemaVersion,
          affectedCellCount: action.patch.length,
          resultSummary: summary
        });
        return summary;
      }
    });
  }

  private async deleteDraft(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'draft.delete' }>
  ) {
    const digest = actionDigest(action);
    const actionId = opaqueId('act');
    let draft: DraftRecord | undefined;
    let plan: TargetPlan | undefined;
    let replay: JournalReplay | undefined;
    return context.transaction<DraftCommandAttempt, Record<string, unknown>>('tabular.capability', {
      prepareBase: async (database) => {
        const repository = new CapabilityRepository(database);
        await repository.lockCommand(context, action.commandId);
        replay = await repository.journalReplay(context, action.commandId);
        if (replay && replay.request_digest !== digest) idempotencyConflict();
        if (replay) {
          plan = await this.prepareTarget(database, replay.file_id, context.connectionId);
          return;
        }
        draft = await repository.draftForUpdate(context, action.draftId);
        assertEditableDraft(draft, action.expectedDraftVersion);
        plan = await this.prepareTarget(database, draft!.file_id, context.connectionId);
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'mutate');
        return replay ? { kind: 'replay', replay } : { kind: 'ready' };
      },
      finalizeBase: async (database, attempt) => {
        if (attempt.kind === 'replay') {
          return { ...attempt.replay.result_summary, replayed: true };
        }
        const repository = new CapabilityRepository(database);
        const abandoned = await repository.abandonDraft(
          context,
          action.draftId,
          action.expectedDraftVersion
        );
        if (!abandoned) conflict('The draft changed before it could be deleted');
        const summary = draftSummary(abandoned, false);
        await repository.insertDraftAction({
          scope: context,
          id: actionId,
          commandId: action.commandId,
          requestDigest: digest,
          fileId: abandoned.fileId,
          actionType: 'draft.delete',
          schemaVersion: abandoned.schemaVersion,
          affectedCellCount: 0,
          resultSummary: summary
        });
        return summary;
      }
    });
  }

  private async promoteDraft(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'draft.promote' }>
  ) {
    const digest = actionDigest(action);
    const actionId = opaqueId('act');
    let draft: DraftRecord | undefined;
    let plan: TargetPlan | undefined;
    let replay: JournalReplay | undefined;
    let issues: ValidationIssue[] = [];
    const result = await context.transaction<IdempotentAttempt>('tabular.capability', {
      prepareBase: async (database) => {
        const repository = new CapabilityRepository(database);
        await repository.lockCommand(context, action.commandId);
        replay = await repository.journalReplay(context, action.commandId);
        if (replay && replay.request_digest !== digest) idempotencyConflict();
        if (replay) {
          plan = await this.prepareTarget(database, replay.file_id, context.connectionId);
          return;
        }
        draft = await repository.draftForUpdate(context, action.draftId);
        assertEditableDraft(draft, action.expectedDraftVersion);
        if (draft!.row_id && !action.expectedRowVersion) {
          throw new ActionFault({
            code: 'invalid_action',
            message: 'An existing-row draft requires an expected row version',
            retryable: false
          });
        }
        plan = await this.prepareTarget(database, draft!.file_id, context.connectionId);
        issues = await plan.adapter.validatePatch(plan.target, draft!.patch);
        if (plan.target.schemaVersion !== draft!.schema_version) issues = [...issues, schemaIssue()];
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'mutate');
        if (replay) return { kind: 'replay', replay };
        if (issues.length) {
          return issues.some((issue) => issue.code === 'schema_changed')
            ? { kind: 'failure', error: schemaError(issues) }
            : validationAttempt(issues);
        }
        return runMutation(database, () => current.adapter.mutate(database, current.target, [{
          ...(draft!.row_id ? { rowId: draft!.row_id } : {}),
          ...(action.expectedRowVersion ? { expectedVersion: action.expectedRowVersion } : {}),
          patch: draft!.patch,
          ...(draft!.row_rank ? { insertRank: draft!.row_rank } : {})
        }]));
      },
      finalizeBase: async (database, attempt) => {
        const repository = new CapabilityRepository(database);
        if (attempt.kind === 'failure') {
          if (draft) await repository.setDraftValidation(context, draft.id, attempt.error.issues || []);
          return attempt;
        }
        if (attempt.kind === 'replay') return attempt;
        const currentDraft = required(draft, 'Draft was not prepared');
        const summary = mutationSummary(actionId, attempt.effect, false);
        await repository.insertCommittedAction({
          scope: context,
          id: actionId,
          commandId: action.commandId,
          requestDigest: digest,
          fileId: currentDraft.file_id,
          actionType: 'draft.promote',
          schemaVersion: currentDraft.schema_version,
          effect: attempt.effect,
          resultSummary: summary
        });
        await repository.promoteDraft(context, currentDraft.id, actionId);
        return attempt;
      }
    });
    if (result.kind === 'failure') throw new ActionFault(result.error);
    if (result.kind === 'replay') return { ...result.replay.result_summary, replayed: true };
    return mutationSummary(actionId, result.effect, false);
  }

  private async listHistory(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'history.list' }>,
    maximumResultBytes?: number
  ) {
    let plan: TargetPlan | undefined;
    let entries = [] as Awaited<ReturnType<CapabilityRepository['listJournal']>>;
    return context.readTransaction({
      prepareBase: async (database) => {
        plan = await this.prepareTarget(database, action.fileId, context.connectionId);
        entries = await new CapabilityRepository(database).listJournal(
          context,
          action.fileId,
          action.limit,
          maximumResultBytes
        );
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'read');
        return entries;
      }
    });
  }

  private async reverseHistory(
    context: AuthorizedExecutionContext,
    action: Extract<CapabilityAction, { type: 'history.undo' | 'history.redo' }>,
    mode: 'undo' | 'redo'
  ) {
    const digest = actionDigest(action);
    const reversalActionId = opaqueId('act');
    let original: SessionHistoryEntry | undefined;
    let plan: TargetPlan | undefined;
    let replay: JournalReplay | undefined;
    let reversal: TargetMutationRow[] = [];
    const result = await context.transaction<IdempotentAttempt>('tabular.capability', {
      prepareBase: async (database) => {
        const repository = new CapabilityRepository(database);
        await repository.lockCommand(context, action.commandId);
        replay = await repository.journalReplay(context, action.commandId);
        if (replay && replay.request_digest !== digest) idempotencyConflict();
        if (replay) {
          plan = await this.prepareTarget(database, replay.file_id, context.connectionId);
          return;
        }
        original = await repository.historyCandidate(context, mode, action.fileId);
        if (!original) historyUnavailable();
        plan = await this.prepareTarget(database, original!.file_id, context.connectionId);
        if (plan.target.schemaVersion !== original!.schema_version) {
          throw new ActionFault(schemaError([schemaIssue()]));
        }
        const entry = required(original, 'History entry was not prepared');
        const changes = mode === 'undo' ? entry.inverse_patch : entry.forward_patch;
        reversal = reversalRows(
          changes,
          entry.operations,
          mode,
          entry.last_reversal_versions || entry.resulting_versions,
          entry.active_incarnations
        );
      },
      target: async (database) => {
        const current = required(plan, 'Target plan was not prepared');
        await current.adapter.authorize(database, current.target, 'mutate');
        if (replay) return { kind: 'replay', replay };
        return runMutation(database, () => current.adapter.mutate(
          database,
          current.target,
          reversal
        ));
      },
      finalizeBase: async (database, attempt) => {
        if (attempt.kind !== 'effect') return attempt;
        const entry = required(original, 'History entry was not prepared');
        const summary = mutationSummary(reversalActionId, attempt.effect, false);
        await new CapabilityRepository(database).insertReversalAction({
          scope: context,
          id: reversalActionId,
          commandId: action.commandId,
          requestDigest: digest,
          mode,
          original: entry,
          effect: attempt.effect,
          resultSummary: summary
        });
        return attempt;
      }
    });
    if (result.kind === 'failure') throw new ActionFault(result.error);
    if (result.kind === 'replay') return { ...result.replay.result_summary, replayed: true };
    return mutationSummary(reversalActionId, result.effect, false);
  }

  private async prepareTarget(
    database: DatabaseExecutor,
    fileId: string,
    connectionId: string
  ): Promise<TargetPlan> {
    for (const adapter of [...this.#targets].reverse()) {
      const target = await adapter.prepare(database, fileId, connectionId);
      if (target) return { adapter, target };
    }
    notFound();
  }
}

async function runMutation(
  database: DatabaseExecutor,
  callback: () => Promise<TargetMutationEffect>
): Promise<MutationAttempt> {
  await database.execute('SAVEPOINT tabular_action_effects');
  try {
    const effect = await callback();
    if (!effect.rows.length || !effect.changes.length) {
      throw new Error('A successful mutation must report affected rows and cells');
    }
    await database.execute('RELEASE SAVEPOINT tabular_action_effects');
    return { kind: 'effect', effect };
  } catch (error) {
    if (!recoverableTargetFailure(error)) throw error;
    await database.execute('ROLLBACK TO SAVEPOINT tabular_action_effects');
    await database.execute('RELEASE SAVEPOINT tabular_action_effects');
    if (error instanceof ActionFault) return { kind: 'failure', error: error.safe };
    const code = postgresCode(error);
    if (code === '42501') {
      return {
        kind: 'failure',
        error: {
          code: 'capability_denied',
          message: 'The requested capability is denied',
          retryable: false
        }
      };
    }
    return validationAttempt([{
      code: 'database_rejected',
      message: 'PostgreSQL rejected the typed values'
    }]);
  }
}

function recoverableTargetFailure(error: unknown) {
  if (error instanceof ActionFault) return true;
  const code = postgresCode(error);
  return code === '42501' || code === 'P0001' || code.startsWith('22') || code.startsWith('23');
}

function safeError(error: unknown): SafeActionError {
  if (error instanceof CapabilityResultBudgetExceededError) {
    return {
      code: 'result_too_large',
      message: 'The capability result is too large; request a narrower result',
      retryable: false
    };
  }
  if (error instanceof ActionFault) return error.safe;
  if (
    error instanceof ApplicationError
    && (error.errorCode === 'capability_denied' || [401, 403].includes(error.statusCode))
  ) {
    return { code: 'capability_denied', message: 'The requested capability is denied', retryable: false };
  }
  const code = postgresCode(error);
  if (code === '42501') {
    return {
      code: 'capability_denied',
      message: 'The requested capability is denied',
      retryable: false
    };
  }
  if (['40001', '40P01', '55P03', '57014'].includes(code)) {
    return {
      code: 'retryable_conflict',
      message: 'The action could not complete and may be retried',
      retryable: true
    };
  }
  return {
    code: 'action_failed',
    message: 'The action could not be completed',
    retryable: false
  };
}

function resultBudget(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_048_576) {
    throw new Error('Capability result budget is invalid');
  }
  return value;
}

function validationAttempt(issues: ValidationIssue[]): MutationAttempt {
  return {
    kind: 'failure',
    error: {
      code: 'validation_failed',
      message: 'The typed values are not valid for this file',
      retryable: false,
      issues
    }
  };
}

function schemaIssue(): ValidationIssue {
  return { code: 'schema_changed', message: 'The file schema changed' };
}

function schemaError(issues: ValidationIssue[]): SafeActionError {
  return {
    code: 'schema_changed',
    message: 'The file schema changed',
    retryable: false,
    issues
  };
}

function mutationSummary(actionId: string, effect: TargetMutationEffect, replayed: boolean) {
  return {
    actionId,
    rows: effect.rows.map((row) => ({ rowId: row.rowId, version: row.resultingVersion })),
    affectedRowCount: effect.rows.length,
    affectedCellCount: effect.changes.length,
    replayed
  };
}

function draftSummary(draft: ReturnType<typeof safeDraft>, replayed: boolean) {
  return {
    id: draft.id,
    ...(draft.rowId ? { rowId: draft.rowId } : {}),
    ...(draft.rowRank ? { rowRank: draft.rowRank } : {}),
    version: draft.version,
    state: draft.state,
    validation: draft.validation,
    replayed
  };
}

function deterministicRows(rows: TargetMutationRow[]) {
  return [...rows].sort((left, right) => (left.rowId || '').localeCompare(right.rowId || ''));
}

function reversalRows(
  changes: AppliedCellChange[],
  operations: Record<string, 'insert' | 'update' | 'delete'>,
  mode: 'undo' | 'redo',
  activeVersions: Record<string, string>,
  activeIncarnations: Record<string, string>
): TargetMutationRow[] {
  const rows = new Map<string, { patch: CellPatch[]; preconditions: CellPatch[] }>();
  for (const change of changes) {
    const row = rows.get(change.rowId) || { patch: [], preconditions: [] };
    row.patch.push({ columnId: change.columnId, value: change.after });
    row.preconditions.push({ columnId: change.columnId, value: change.before });
    rows.set(change.rowId, row);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([rowId, values]) => {
      const originalOperation = operations[rowId] || 'update';
      if (originalOperation === 'insert') {
        return mode === 'undo'
          ? {
            rowId,
            operation: 'delete' as const,
            expectedVersion: activeVersions[rowId],
            patch: [],
            preconditions: values.preconditions
          }
          : {
            rowId,
            operation: 'insert' as const,
            patch: values.patch
          };
      }
      if (originalOperation === 'delete') {
        return mode === 'undo'
          ? {
            rowId,
            operation: 'insert' as const,
            patch: values.patch
          }
          : {
            rowId,
            operation: 'delete' as const,
            expectedVersion: activeVersions[rowId],
            patch: [],
            preconditions: values.preconditions
          };
      }
      return {
        rowId,
        operation: 'update' as const,
        expectedVersion: activeVersions[rowId],
        expectedIncarnation: activeIncarnations[rowId],
        ...values
      };
    });
}

function mergePatch(current: CellPatch[], update: CellPatch[]) {
  const merged = new Map(current.map((entry) => [entry.columnId, entry]));
  for (const entry of update) merged.set(entry.columnId, entry);
  return [...merged.values()].sort((left, right) => left.columnId.localeCompare(right.columnId));
}

function boundedDraftExpiry(value: string) {
  const requested = new Date(value);
  const now = Date.now();
  const maximum = now + 30 * 24 * 60 * 60 * 1000;
  if (requested.getTime() <= now || requested.getTime() > maximum) {
    throw new ActionFault({
      code: 'invalid_action',
      message: 'Draft expiry must be in the future and within the current retention bound',
      retryable: false
    });
  }
  return requested;
}

function assertEditableDraft(draft: DraftRecord | undefined, expectedVersion: number) {
  if (!draft) notFound();
  if (draft.state !== 'active') conflict('The draft is no longer active');
  if (Number(draft.draft_version) !== expectedVersion) {
    conflict('The draft changed before this action');
  }
}

function actionDigest(action: CapabilityAction) {
  return createHash('sha256').update(stableJson(action)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function postgresCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}

function required<Value>(value: Value | undefined, message: string): Value {
  if (typeof value === 'undefined') throw new Error(message);
  return value;
}

function notFound(): never {
  throw new ActionFault({
    code: 'not_found',
    message: 'The requested resource is unavailable',
    retryable: false
  });
}

function historyUnavailable(): never {
  throw new ActionFault({
    code: 'history_not_available',
    message: 'No reversible action is available',
    retryable: false
  });
}

function conflict(message: string): never {
  throw new ActionFault({ code: 'conflict', message, retryable: false });
}

function idempotencyConflict(): never {
  conflict('The command identity was already used for a different action');
}
