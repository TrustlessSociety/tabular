import { createHash } from 'node:crypto';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import { opaqueId } from '../../identity/helpers/security.js';
import type { CapabilityPluginService } from '../../capability/helpers/service.js';
import type {
  CreateSavedViewInput,
  MoveRowInput,
  SavedView,
  SavedViewCapabilities,
  SavedViewCollection,
  UpdateSavedViewInput
} from './contracts.js';
import {
  iso,
  SavedViewsRepository,
  type FileColumnRow,
  type FileTargetRow,
  type RowOrderRow,
  type SavedViewCommandRow,
  type SavedViewRow
} from './repository.js';
import {
  validateCreate,
  validateDefinition,
  validateDelete,
  validateDuplicate,
  validateMove,
  savedViewSlug,
  validateUpdate
} from './validation.js';

export const SAVED_VIEWS_SERVICE = 'tabular.saved-views';

type FileAuthority = {
  canSelect: boolean;
  canPublishShared: boolean;
  canMoveRows: boolean;
  rowOrderState: SavedViewCapabilities['rowOrderState'];
  rowOrderReason?: string;
};

export class SavedViewsPluginService {
  readonly name = SAVED_VIEWS_SERVICE;

  constructor(
    private readonly identity: IdentityPluginService,
    private readonly capability: CapabilityPluginService
  ) {}

  async list(
    principal: BrowserPrincipal,
    fileIds?: string[]
  ): Promise<SavedViewCollection> {
    let rows: SavedViewRow[] = [];
    let targets: FileTargetRow[] = [];
    let rowOrders = new Map<string, RowOrderRow>();
    let cursor = 0;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.saved-views',
      async (database) => {
        const authorities = new Map<string, FileAuthority>();
        for (const target of targets) {
          const authority = await fileAuthority(database, target, rowOrders.get(target.file_id));
          authorities.set(target.file_id, authority);
        }
        const views = rows.flatMap((row) => {
          const authority = authorities.get(row.file_id);
          return authority?.canSelect ? [safeView(row, principal, authority)] : [];
        });
        const capabilities = Object.fromEntries([...authorities.entries()].flatMap(([fileId, authority]) => (
          authority.canSelect ? [[fileId, {
            canCreatePrivate: true,
            canPublishShared: authority.canPublishShared,
            canMoveRows: authority.canMoveRows,
            rowOrderState: authority.rowOrderState,
            ...(rowOrders.get(fileId) ? {
              rowOrderVersion: Number(rowOrders.get(fileId)!.version)
            } : {}),
            ...(authority.rowOrderReason ? { rowOrderReason: authority.rowOrderReason } : {})
          } satisfies SavedViewCapabilities]] : []
        )));
        return { views, capabilities, cursor };
      },
      async (database) => {
        const repository = new SavedViewsRepository(database);
        rows = await repository.list(
          principal.identityId,
          principal.connectionId,
          fileIds
        );
        const requested = unique(fileIds || rows.map((row) => row.file_id));
        targets = await repository.targets(principal.connectionId, requested);
        for (const fileId of requested) {
          const order = await repository.rowOrder(fileId);
          if (order) rowOrders.set(fileId, order);
        }
        cursor = await repository.currentCursor(principal.connectionId);
      },
      undefined,
      'read committed'
    );
  }

  async get(principal: BrowserPrincipal, viewId: string) {
    let row: SavedViewRow | undefined;
    let target: FileTargetRow | undefined;
    let rowOrder: RowOrderRow | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.saved-views',
      async (database) => {
        if (!row || !target) unavailable();
        const authority = await fileAuthority(database, target, rowOrder);
        if (!authority.canSelect
          || (row.access === 'private' && row.owner_identity_id !== principal.identityId)) {
          unavailable();
        }
        return safeView(row, principal, authority);
      },
      async (database) => {
        const repository = new SavedViewsRepository(database);
        row = await repository.byId(viewId);
        if (!row || row.connection_id !== principal.connectionId) return;
        target = (await repository.targets(principal.connectionId, [row.file_id]))[0];
        rowOrder = await repository.rowOrder(row.file_id);
      },
      undefined,
      'read committed'
    );
  }

  async create(
    principal: BrowserMutationPrincipal,
    input: CreateSavedViewInput,
    commandId = `cmd_view_create_${Date.now()}`,
    command: {
      actionType: 'saved-view.create' | 'saved-view.duplicate';
      requestDigest: string;
    } = {
      actionType: 'saved-view.create',
      requestDigest: actionDigest('saved-view.create', input)
    }
  ): Promise<SavedView & { replayed?: true }> {
    input = validateCreate(input as unknown as Record<string, unknown>);
    const requestDigest = command.actionType === 'saved-view.create'
      ? actionDigest('saved-view.create', input)
      : command.requestDigest;
    const viewId = opaqueId('view');
    const eventId = opaqueId('evt');
    let replay: SavedViewCommandRow | undefined;
    let target: FileTargetRow | undefined;
    let targetColumns: FileColumnRow[] = [];
    let authority: FileAuthority | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.saved-views',
      async (database) => {
        if (!target) unavailable();
        authority = await fileAuthority(database, target);
        const saved = replay ? savedViewReplay(replay) : undefined;
        assertViewWriteAuthority(saved?.access || input.access, principal, undefined, authority);
        if (saved) return saved;
        await assertDefinitionColumns(database, target, targetColumns, input.definition);
        return undefined;
      },
      async (database) => {
        const repository = new SavedViewsRepository(database);
        await repository.lockCommand(principal.identityId, principal.connectionId, commandId);
        replay = await repository.commandReplay(
          principal.identityId,
          principal.connectionId,
          commandId
        );
        assertReplay(replay, requestDigest, command.actionType);
        const fileId = replay ? savedViewReplay(replay).fileId : input.fileId;
        target = (await repository.targets(principal.connectionId, [fileId]))[0];
        if (!replay && target) targetColumns = await repository.targetColumns(input.fileId);
      },
      async (database, result) => {
        if (replay) return { ...(result as SavedView), replayed: true as const };
        const repository = new SavedViewsRepository(database);
        const row = await repository.insert({
          id: viewId,
          connectionId: principal.connectionId,
          fileId: input.fileId,
          ownerIdentityId: principal.identityId,
          name: input.name,
          slug: savedViewSlug(input.name, viewId),
          access: input.access,
          definition: input.definition
        });
        await repository.appendOutbox({
          id: eventId,
          connectionId: principal.connectionId,
          fileId: input.fileId,
          actorIdentityId: principal.identityId,
          ...(input.access === 'private' ? { audienceIdentityId: principal.identityId } : {}),
          eventType: 'saved-view.changed',
          idempotencyKey: `saved-view:create:${principal.connectionId}:${principal.identityId}:${commandId}`,
          payload: { viewId, access: input.access, version: 1 }
        });
        const saved = safeView(row, principal, authority!);
        await repository.insertCommand({
          identityId: principal.identityId,
          connectionId: principal.connectionId,
          commandId,
          requestDigest,
          actionType: command.actionType,
          result: saved as unknown as Record<string, unknown>
        });
        return saved;
      },
      'read committed'
    );
  }

  async update(
    principal: BrowserMutationPrincipal,
    input: UpdateSavedViewInput,
    commandId = `cmd_view_update_${Date.now()}`
  ): Promise<SavedView & { replayed?: true }> {
    input = validateUpdate(input as unknown as Record<string, unknown>);
    const requestDigest = actionDigest('saved-view.update', input);
    const eventId = opaqueId('evt');
    let replay: SavedViewCommandRow | undefined;
    let row: SavedViewRow | undefined;
    let target: FileTargetRow | undefined;
    let targetColumns: FileColumnRow[] = [];
    let authority: FileAuthority | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.saved-views',
      async (database) => {
        if (replay) {
          if (!target) unavailable();
          const saved = savedViewReplay(replay);
          authority = await fileAuthority(database, target);
          assertViewWriteAuthority(saved.access, principal, undefined, authority);
          return saved;
        }
        if (!row || !target || Number(row.version) !== input.expectedVersion) conflict();
        if (row.access !== input.access) {
          conflict('Saved-view access cannot be changed; duplicate it into a new view instead');
        }
        authority = await fileAuthority(database, target);
        assertViewWriteAuthority(input.access, principal, row, authority);
        await assertDefinitionColumns(database, target, targetColumns, input.definition);
        return undefined;
      },
      async (database) => {
        const repository = new SavedViewsRepository(database);
        await repository.lockCommand(principal.identityId, principal.connectionId, commandId);
        replay = await repository.commandReplay(
          principal.identityId,
          principal.connectionId,
          commandId
        );
        assertReplay(replay, requestDigest, 'saved-view.update');
        if (replay) {
          target = (await repository.targets(
            principal.connectionId,
            [savedViewReplay(replay).fileId]
          ))[0];
        } else {
          row = await repository.byId(input.viewId, true);
          if (!row || row.connection_id !== principal.connectionId) return;
          target = (await repository.targets(principal.connectionId, [row.file_id]))[0];
          if (target) targetColumns = await repository.targetColumns(row.file_id);
        }
      },
      async (database, result) => {
        if (replay) return { ...(result as SavedView), replayed: true as const };
        const repository = new SavedViewsRepository(database);
        const updated = await repository.update({
          viewId: input.viewId,
          expectedVersion: input.expectedVersion,
          name: input.name,
          slug: savedViewSlug(input.name, input.viewId),
          access: input.access,
          definition: input.definition
        });
        if (!updated) conflict();
        await repository.appendOutbox({
          id: eventId,
          connectionId: principal.connectionId,
          fileId: updated.file_id,
          actorIdentityId: principal.identityId,
          ...(updated.access === 'private' ? {
            audienceIdentityId: updated.owner_identity_id
          } : {}),
          eventType: 'saved-view.changed',
          idempotencyKey: `saved-view:update:${principal.connectionId}:${principal.identityId}:${commandId}`,
          payload: { viewId: updated.id, access: updated.access, version: Number(updated.version) }
        });
        const saved = safeView(updated, principal, authority!);
        await repository.insertCommand({
          identityId: principal.identityId,
          connectionId: principal.connectionId,
          commandId,
          requestDigest,
          actionType: 'saved-view.update',
          result: saved as unknown as Record<string, unknown>
        });
        return saved;
      },
      'read committed'
    );
  }

  async duplicate(
    principal: BrowserMutationPrincipal,
    input: { viewId: string; name: string; access: 'private' | 'shared' },
    commandId: string
  ): Promise<SavedView & { replayed?: true }> {
    input = validateDuplicate(input as unknown as Record<string, unknown>);
    const requestDigest = actionDigest('saved-view.duplicate', input);
    let replay: SavedViewCommandRow | undefined;
    let target: FileTargetRow | undefined;
    const replayed = await this.identity.authorizedTransaction(
      principal,
      'tabular.saved-views',
      async (database) => {
        if (!replay) return undefined;
        if (!target) unavailable();
        const saved = savedViewReplay(replay);
        const authority = await fileAuthority(database, target);
        assertViewWriteAuthority(saved.access, principal, undefined, authority);
        return { ...saved, replayed: true as const };
      },
      async (database) => {
        const repository = new SavedViewsRepository(database);
        replay = await repository.commandReplay(
          principal.identityId,
          principal.connectionId,
          commandId
        );
        assertReplay(replay, requestDigest, 'saved-view.duplicate');
        if (replay) {
          target = (await repository.targets(
            principal.connectionId,
            [savedViewReplay(replay).fileId]
          ))[0];
        }
      },
      undefined,
      'read committed'
    );
    if (replayed) return replayed;
    const source = await this.get(principal, input.viewId);
    return this.create(principal, {
      fileId: source.fileId,
      name: input.name,
      access: input.access,
      definition: validateDefinition(source.definition)
    }, commandId, {
      actionType: 'saved-view.duplicate',
      requestDigest
    });
  }

  async delete(
    principal: BrowserMutationPrincipal,
    input: { viewId: string; expectedVersion: number },
    commandId = `cmd_view_delete_${Date.now()}`
  ): Promise<{ id: string; deleted: true; replayed?: true }> {
    input = validateDelete(input as unknown as Record<string, unknown>);
    const requestDigest = actionDigest('saved-view.delete', input);
    const eventId = opaqueId('evt');
    let replay: SavedViewCommandRow | undefined;
    let row: SavedViewRow | undefined;
    let target: FileTargetRow | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.saved-views',
      async (database) => {
        if (replay) {
          if (!target) unavailable();
          const deleted = deletedViewReplay(replay);
          const authority = await fileAuthority(database, target);
          assertViewWriteAuthority(deleted.access, principal, undefined, authority);
          return { id: deleted.id, deleted: true as const };
        }
        if (!row || !target || Number(row.version) !== input.expectedVersion) conflict();
        const authority = await fileAuthority(database, target);
        assertViewWriteAuthority(row.access, principal, row, authority);
        return undefined;
      },
      async (database) => {
        const repository = new SavedViewsRepository(database);
        await repository.lockCommand(principal.identityId, principal.connectionId, commandId);
        replay = await repository.commandReplay(
          principal.identityId,
          principal.connectionId,
          commandId
        );
        assertReplay(replay, requestDigest, 'saved-view.delete');
        if (replay) {
          target = (await repository.targets(
            principal.connectionId,
            [deletedViewReplay(replay).fileId]
          ))[0];
        } else {
          row = await repository.byId(input.viewId, true);
          if (!row || row.connection_id !== principal.connectionId) return;
          target = (await repository.targets(principal.connectionId, [row.file_id]))[0];
        }
      },
      async (database, result) => {
        if (replay) return {
          ...(result as { id: string; deleted: true }),
          replayed: true as const
        };
        const repository = new SavedViewsRepository(database);
        if (!await repository.delete(input.viewId, input.expectedVersion)) conflict();
        await repository.appendOutbox({
          id: eventId,
          connectionId: principal.connectionId,
          fileId: row!.file_id,
          actorIdentityId: principal.identityId,
          ...(row!.access === 'private' ? {
            audienceIdentityId: row!.owner_identity_id
          } : {}),
          eventType: 'saved-view.deleted',
          idempotencyKey: `saved-view:delete:${principal.connectionId}:${principal.identityId}:${commandId}`,
          payload: { viewId: row!.id }
        });
        const deleted = { id: row!.id, deleted: true as const };
        await repository.insertCommand({
          identityId: principal.identityId,
          connectionId: principal.connectionId,
          commandId,
          requestDigest,
          actionType: 'saved-view.delete',
          result: {
            ...deleted,
            fileId: row!.file_id,
            access: row!.access
          }
        });
        return deleted;
      },
      'read committed'
    );
  }

  async moveRow(
    principal: BrowserMutationPrincipal,
    input: MoveRowInput,
    commandId = `cmd_row_move_${Date.now()}`
  ): Promise<{ fileId: string; rebalanced: boolean; version: number; replayed?: true }> {
    input = validateMove(input as unknown as Record<string, unknown>);
    const requestDigest = actionDigest('row-order.move', input);
    const eventId = opaqueId('evt');
    let replay: SavedViewCommandRow | undefined;
    let target: FileTargetRow | undefined;
    let rowOrder: RowOrderRow | undefined;
    let plan: Awaited<ReturnType<CapabilityPluginService['prepareGridTarget']>>;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.saved-views',
      async (database) => {
        if (!target || !rowOrder) {
          if (replay) unavailable();
          conflict('The shared row order changed; reload before moving this row');
        }
        const authority = await fileAuthority(database, target, rowOrder);
        if (!authority.canMoveRows) denied('Update permission on the shared row-order field is required');
        if (replay) return movedRowReplay(replay);
        if (!plan || Number(rowOrder.version) !== input.expectedVersion) {
          conflict('The shared row order changed; reload before moving this row');
        }
        return this.capability.moveGridRow(database, plan, input);
      },
      async (database) => {
        const repository = new SavedViewsRepository(database);
        await repository.lockCommand(principal.identityId, principal.connectionId, commandId);
        replay = await repository.commandReplay(
          principal.identityId,
          principal.connectionId,
          commandId
        );
        assertReplay(replay, requestDigest, 'row-order.move');
        const fileId = replay ? movedRowReplay(replay).fileId : input.fileId;
        target = (await repository.targets(principal.connectionId, [fileId]))[0];
        if (replay) {
          rowOrder = await repository.rowOrder(fileId);
        } else {
          plan = await this.capability.prepareGridTarget(
            database,
            input.fileId,
            principal.connectionId
          );
          await repository.lockRowOrder(input.fileId);
          rowOrder = await repository.rowOrder(input.fileId, true);
        }
      },
      async (database, effect) => {
        if (replay) return {
          ...(effect as { fileId: string; rebalanced: boolean; version: number }),
          replayed: true as const
        };
        const repository = new SavedViewsRepository(database);
        const version = await repository.advanceRowOrder(
          input.fileId,
          input.expectedVersion,
          effect.rebalanced
        );
        if (!version) conflict('The shared row order changed; reload before moving this row');
        await repository.appendOutbox({
          id: eventId,
          connectionId: principal.connectionId,
          fileId: input.fileId,
          actorIdentityId: principal.identityId,
          eventType: 'row-order.changed',
          idempotencyKey: `row-order:move:${principal.connectionId}:${principal.identityId}:${commandId}`,
          payload: { version, rebalanced: effect.rebalanced }
        });
        const moved = { ...effect, version };
        await repository.insertCommand({
          identityId: principal.identityId,
          connectionId: principal.connectionId,
          commandId,
          requestDigest,
          actionType: 'row-order.move',
          result: moved as unknown as Record<string, unknown>
        });
        return moved;
      },
      'read committed'
    );
  }
}

async function fileAuthority(
  database: DatabaseExecutor,
  target: FileTargetRow,
  rowOrder?: RowOrderRow
): Promise<FileAuthority> {
  const result = await database.execute<{
    can_select: boolean;
    can_publish: boolean;
    rank_valid: boolean;
    rank_select: boolean;
    rank_update: boolean;
    key_select: boolean;
  }>(`
    SELECT
      has_schema_privilege(current_user, c.relnamespace, 'USAGE') AND (
        has_table_privilege(current_user, c.oid, 'SELECT') OR EXISTS (
          SELECT 1 FROM pg_attribute visible
           WHERE visible.attrelid = c.oid AND visible.attnum > 0
             AND NOT visible.attisdropped
             AND has_column_privilege(current_user, c.oid, visible.attnum, 'SELECT')
        )
      ) AS can_select,
      pg_has_role(current_user, c.relowner, 'USAGE') AS can_publish,
      CASE WHEN ?::smallint IS NULL THEN false ELSE EXISTS (
        SELECT 1 FROM pg_attribute rank
         WHERE rank.attrelid = c.oid AND rank.attnum = ?::smallint
           AND rank.attname = ? AND rank.atttypid = 'text'::regtype
           AND rank.attcollation = '"C"'::regcollation
           AND rank.attnum > 0 AND NOT rank.attisdropped
           AND rank.attidentity = '' AND rank.attgenerated = ''
      ) END AS rank_valid,
      CASE WHEN ?::smallint IS NULL THEN false ELSE
        has_column_privilege(current_user, c.oid, ?::smallint, 'SELECT') END AS rank_select,
      CASE WHEN ?::smallint IS NULL THEN false ELSE
        has_column_privilege(current_user, c.oid, ?::smallint, 'UPDATE') END AS rank_update
      , EXISTS (
        SELECT 1
          FROM pg_index key_index
          JOIN pg_constraint key_constraint
            ON key_constraint.conindid = key_index.indexrelid
           AND key_constraint.conrelid = key_index.indrelid
         WHERE key_index.indrelid = c.oid
           AND key_constraint.contype IN ('p', 'u')
           AND key_constraint.convalidated AND NOT key_constraint.condeferrable
           AND key_index.indisunique AND key_index.indisvalid
           AND key_index.indisready AND key_index.indimmediate
           AND key_index.indpred IS NULL AND key_index.indexprs IS NULL
           AND key_index.indnkeyatts BETWEEN 1 AND 8
           AND NOT EXISTS (
             SELECT 1
               FROM unnest(key_index.indkey::smallint[]) WITH ORDINALITY AS key(attnum, position)
               JOIN pg_attribute key_column
                 ON key_column.attrelid = c.oid AND key_column.attnum = key.attnum
              WHERE key.position <= key_index.indnkeyatts
                AND (
                  NOT key_column.attnotnull OR key_column.attgenerated <> ''
                  OR NOT has_column_privilege(current_user, c.oid, key.attnum, 'SELECT')
                  OR key_column.atttypid NOT IN (
                    'text'::regtype, 'varchar'::regtype, 'bpchar'::regtype,
                    'uuid'::regtype, 'name'::regtype, 'int2'::regtype,
                    'int4'::regtype, 'int8'::regtype, 'numeric'::regtype,
                    'bool'::regtype, 'date'::regtype, 'time'::regtype,
                    'timestamp'::regtype, 'timestamptz'::regtype,
                    'json'::regtype, 'jsonb'::regtype
                  )
                )
           )
      ) AS key_select
      FROM pg_class c
     WHERE c.oid = ?::oid AND c.relkind IN ('r', 'p')
  `, [
    rowOrder?.attribute_number || null,
    rowOrder?.attribute_number || null,
    rowOrder?.physical_name || '',
    rowOrder?.attribute_number || null,
    rowOrder?.attribute_number || null,
    rowOrder?.attribute_number || null,
    rowOrder?.attribute_number || null,
    target.relation_oid
  ]);
  const row = result.rows[0];
  const canSelect = Boolean(row?.can_select) && ['current', 'renamed', 'changed'].includes(target.state);
  if (!rowOrder) {
    return {
      canSelect,
      canPublishShared: canSelect && Boolean(row?.can_publish),
      canMoveRows: false,
      rowOrderState: 'install-required',
      rowOrderReason: 'The table owner must install the shared row-order field.'
    };
  }
  const ready = canSelect && Boolean(
    row?.rank_valid && row.rank_select && row.rank_update && row.key_select
  )
    && rowOrder.object_state !== 'missing'
    && rowOrder.column_state === 'current';
  return {
    canSelect,
    canPublishShared: canSelect && Boolean(row?.can_publish),
    canMoveRows: ready,
    rowOrderState: ready ? 'ready' : 'denied',
    ...(ready ? {} : {
      rowOrderReason: 'Current PostgreSQL authority cannot update the shared row-order field.'
    })
  };
}

async function assertDefinitionColumns(
  database: DatabaseExecutor,
  target: FileTargetRow,
  columns: FileColumnRow[],
  definition: SavedView['definition']
) {
  if (!columns.length && definition.columnOrder.length) invalidDefinition();
  if (!columns.length) return;
  const result = await database.execute<{ attribute_number: string | number }>(`
    SELECT a.attnum AS attribute_number
      FROM pg_attribute a
     WHERE a.attrelid = ?::oid
       AND a.attnum IN (${columns.map(() => '?::smallint').join(', ')})
       AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege(current_user, a.attrelid, a.attnum, 'SELECT')
  `, [target.relation_oid, ...columns.map((column) => column.attribute_number)]);
  const permittedNumbers = new Set(result.rows.map((row) => Number(row.attribute_number)));
  const permittedIds = new Set(columns.flatMap((column) => (
    permittedNumbers.has(Number(column.attribute_number)) ? [column.column_id] : []
  )));
  if (definition.columnOrder.some((columnId) => !permittedIds.has(columnId))) {
    invalidDefinition();
  }
}

function savedViewReplay(replay: SavedViewCommandRow): SavedView {
  const result = replay.result;
  if (typeof result.fileId !== 'string'
    || (result.access !== 'private' && result.access !== 'shared')) unavailable();
  return result as unknown as SavedView;
}

function deletedViewReplay(replay: SavedViewCommandRow) {
  const result = replay.result;
  if (typeof result.id !== 'string' || result.deleted !== true
    || typeof result.fileId !== 'string'
    || (result.access !== 'private' && result.access !== 'shared')) unavailable();
  return result as unknown as {
    id: string;
    deleted: true;
    fileId: string;
    access: 'private' | 'shared';
  };
}

function movedRowReplay(replay: SavedViewCommandRow) {
  const result = replay.result;
  if (typeof result.fileId !== 'string'
    || typeof result.rebalanced !== 'boolean'
    || !Number.isSafeInteger(result.version)) unavailable();
  return result as unknown as { fileId: string; rebalanced: boolean; version: number };
}

function safeView(
  row: SavedViewRow,
  principal: BrowserPrincipal,
  authority: FileAuthority
): SavedView {
  const privateOwner = row.access === 'private' && row.owner_identity_id === principal.identityId;
  const sharedManager = row.access === 'shared' && authority.canPublishShared;
  return {
    id: row.id,
    fileId: row.file_id,
    ownerIdentityId: row.owner_identity_id,
    name: row.name,
    slug: row.slug,
    access: row.access,
    definition: structuredClone(row.definition),
    version: Number(row.version),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    permissions: {
      update: privateOwner || sharedManager,
      delete: privateOwner || sharedManager,
      duplicate: authority.canSelect
    }
  };
}

function assertViewWriteAuthority(
  nextAccess: 'private' | 'shared',
  principal: BrowserPrincipal,
  existing: SavedViewRow | undefined,
  authority: FileAuthority
) {
  if (!authority.canSelect) denied('Current PostgreSQL SELECT permission is required');
  if (existing?.access === 'private' && existing.owner_identity_id !== principal.identityId) {
    denied('Only the private view owner can change this view');
  }
  if ((existing?.access === 'shared' || nextAccess === 'shared') && !authority.canPublishShared) {
    denied('Only the table owner or an owning-role member can publish shared views');
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function actionDigest(type: string, value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonical({ type, value }))).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

function assertReplay(
  replay: SavedViewCommandRow | undefined,
  requestDigest: string,
  actionType: string
) {
  if (!replay) return;
  if (replay.request_digest !== requestDigest || replay.action_type !== actionType) {
    throw new ApplicationError(
      'saved_view_idempotency_conflict',
      409,
      'The command identity is already bound to another saved-view or row-order change'
    );
  }
}

function unavailable(): never {
  throw new ApplicationError('saved_view_unavailable', 404, 'The saved view or file is unavailable');
}

function invalidDefinition(): never {
  throw new ApplicationError(
    'saved_view_invalid_definition',
    400,
    'The saved view references a column that is stale, foreign, hidden, or unavailable'
  );
}

function denied(message: string): never {
  throw new ApplicationError('saved_view_denied', 403, message);
}

function conflict(message = 'The saved view changed; reload before trying again'): never {
  throw new ApplicationError('saved_view_conflict', 409, message);
}
