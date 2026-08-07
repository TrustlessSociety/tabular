//node
import { createHash } from 'node:crypto';

//modules
import type { Value } from '@stackpress/inquire/types';

//client
import type {
  StableCatalogSnapshot,
  StableObject,
  StableSchema
} from '../../catalog/helpers/contracts.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { GridFilter, GridSort } from '../../grid/helpers/contracts.js';
import type {
  CapabilityTargetAdapter,
  CellPatch,
  PreparedTarget,
  TargetMutationEffect,
  TargetMutationRow,
  TypedCellValue,
  ValidationIssue
} from './contracts.js';
import type {
  PostgreSqlBrowseResult,
  PostgreSqlColumnCodec
} from './postgresql-target.js';
import type { GridQueryInput } from './service.js';
import { quoteIdentifier } from '../../database/helpers/identifiers.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import { ActionFault, CapabilityResultBudgetExceededError } from './contracts.js';

type LiveColumn = {
  attribute_number: number,
  name: string,
  type_name: string,
  formatted_type: string,
  nullable: boolean,
  identity_kind: string,
  generated_kind: string,
  has_default: boolean,
};

type NativeColumn = {
  columnId: string,
  columnName: string,
  attributeNumber: number,
  codec: PostgreSqlColumnCodec,
  collatable: boolean,
  key: boolean,
  editable: boolean,
  generated: boolean,
  serverDefault: boolean,
};

type UnstructuredColumn = {
  columnId: string,
  codec: PostgreSqlColumnCodec,
};

type NativeDefinition = {
  relationOid: string,
  schemaName: string,
  tableName: string,
  qualifiedName: string,
  tableReference: string,
  keyColumns: NativeColumn[],
  columns: NativeColumn[],
  storedColumns: NativeColumn[],
  rankColumn?: NativeColumn,
  jsonColumn?: NativeColumn,
  unstructuredColumns: UnstructuredColumn[],
  versionColumnAlias: string,
  columnsById: Map<string, NativeColumn>,
  unstructuredById: Map<string, UnstructuredColumn>,
  preparedLiveColumns: LiveColumn[],
};

type NativeState = { definition: NativeDefinition, };
type DatabaseRow = Record<string, unknown>;
type NativeColumnPrivilege = {
  attribute_number: number,
  can_select: boolean,
  can_update: boolean,
  can_insert: boolean,
};
type AuthorizedReadMode = 'current-grid' | 'authorized-query';
type AuthorizedReadInput = {
  columnIds: string[],
  sorts: GridSort[],
  filters: GridFilter[],
  limit: number,
  mode: AuthorizedReadMode,
  includeSentinel: boolean,
};

const RANK_WIDTH = 24;
const RANK_GAP = 1_000_000n;
const MAX_RANK = (10n ** BigInt(RANK_WIDTH)) - 1n;

/**
 * Catalog-driven target for native PostgreSQL tables with a stable, non-null
 * primary/unique key. It keeps physical names server-side and represents
 * composite keys as one opaque stable row identity.
 */
export class CatalogPostgreSqlTargetAdapter implements CapabilityTargetAdapter {
  //The name state retained by this class instance
  public readonly name = 'catalog-postgresql-targets';

  /**
   * Prepare the current value.
   */
  public async prepare(database: DatabaseExecutor, fileId: string, connectionId?: string) {
    if (!connectionId) return undefined;
    const snapshot = await reconcileCatalog(database, connectionId);
    const object = stableObject(snapshot, fileId);
    if (!object || !['table', 'partitioned-table'].includes(object.kind)) return undefined;
    const schema = stableSchema(snapshot, object.schemaId);
    if (!schema) return undefined;
    const live = await readLiveColumns(database, object.relationOid);
    const stableByNumber = new Map(
      [...snapshot.columns.values()]
        .filter((column) => column.objectId === fileId && column.state === 'current')
        .map((column) => [column.attributeNumber, column])
    );
    if (!live.length || live.some((column) => !stableByNumber.has(column.attribute_number))) {
      return undefined;
    }
    const keyNumbers = await eligibleKey(database, object.relationOid, live);
    if (!keyNumbers) return undefined;
    const keySet = new Set(keyNumbers);
    const hidden = await hiddenColumns(database, fileId);
    const allColumns: NativeColumn[] = [];
    for (const column of live) {
      const stable = stableByNumber.get(column.attribute_number)!;
      const codec = codecFor(column.type_name);
      //Lossless delete/undo requires every stored, non-generated value to be
      // representable. Identity columns need a separate owner-approved lane.
      if (!codec || column.identity_kind) return undefined;
      allColumns.push({
        columnId: stable.stableId,
        columnName: column.name,
        attributeNumber: column.attribute_number,
        codec,
        collatable: ['text', 'varchar', 'bpchar', 'name'].includes(column.type_name),
        key: keySet.has(column.attribute_number),
        editable: !keySet.has(column.attribute_number) && !column.generated_kind,
        generated: Boolean(column.generated_kind),
        serverDefault: column.has_default
      });
    }
    const keyColumns = keyNumbers.map((number) =>
      allColumns.find((column) => column.attributeNumber === number)
    );
    const columns = allColumns.filter((column) => !hidden.has(column.attributeNumber));
    const rankNumber = [...hidden.entries()].find(([, purpose]) => purpose === 'shared-rank')?.[0];
    const rankColumn = typeof rankNumber === 'number'
      ? allColumns.find((column) => column.attributeNumber === rankNumber)
      : undefined;
    const jsonNumber = [...hidden.entries()].find(([, purpose]) => purpose === 'unstructured-json')?.[0];
    const jsonColumn = typeof jsonNumber === 'number'
      ? allColumns.find((column) => column.attributeNumber === jsonNumber)
      : undefined;
    const unstructuredColumns = jsonColumn?.codec === 'json'
      ? await readUnstructuredColumns(database, fileId)
      : [];
    if (keyColumns.some((column) => !column)
      || (columns.length > 0 && !columns.some((column) => column.editable))) {
      return undefined;
    }
    const qualifiedName = `${quoteIdentifier(schema.name)}.${quoteIdentifier(object.name)}`;
    const definition: NativeDefinition = {
      relationOid: object.relationOid,
      schemaName: schema.name,
      tableName: object.name,
      qualifiedName,
      tableReference: object.kind === 'table' ? `ONLY ${qualifiedName}` : qualifiedName,
      keyColumns: keyColumns as NativeColumn[],
      columns,
      storedColumns: columns.filter((column) => !column.generated),
      ...(rankColumn ? { rankColumn } : {}),
      ...(jsonColumn ? { jsonColumn } : {}),
      unstructuredColumns,
      versionColumnAlias: unusedVersionColumnAlias(live),
      columnsById: new Map(columns.map((column) => [column.columnId, column])),
      unstructuredById: new Map(unstructuredColumns.map((column) => [column.columnId, column])),
      preparedLiveColumns: live
    };
    const schemaVersion = createHash('sha256').update(JSON.stringify([
      snapshot.databaseOid,
      object.relationOid,
      live,
      keyNumbers,
      columns.map(({ columnId, attributeNumber, codec, key }) => ({
        columnId, attributeNumber, codec, key
      })),
      unstructuredColumns,
      [...hidden.entries()]
    ])).digest('hex');
    return { fileId, schemaVersion, state: { definition } satisfies NativeState };
  }

  /**
   * Validate the patch.
   */
  public async validatePatch(target: PreparedTarget, patch: CellPatch[]): Promise<ValidationIssue[]> {
    const definition = nativeState(target).definition;
    const issues: ValidationIssue[] = [];
    for (const entry of patch) {
      const column = definition.columnsById.get(entry.columnId)
        || definition.unstructuredById.get(entry.columnId);
      if (!column) {
        issues.push({
          columnId: entry.columnId,
          code: 'column_unavailable',
          message: 'The column is unavailable'
        });
      } else if (entry.value.type !== 'null' && entry.value.type !== column.codec) {
        issues.push({
          columnId: entry.columnId,
          code: 'type_mismatch',
          message: 'The typed value does not match the column'
        });
      } else if ('key' in column && column.key && entry.value.type === 'null') {
        issues.push({
          columnId: entry.columnId,
          code: 'key_required',
          message: 'Stable key columns cannot be empty'
        });
      } else if ('generated' in column && column.generated) {
        issues.push({
          columnId: entry.columnId,
          code: 'read_only',
          message: 'PostgreSQL generated columns are read-only'
        });
      }
    }
    return issues;
  }

  /**
   * Handle the authorize operation.
   */
  public async authorize(database: DatabaseExecutor, target: PreparedTarget, _operation: 'read' | 'mutate') {
    const definition = nativeState(target).definition;
    await database.execute(`SELECT 1 FROM ${definition.tableReference} WHERE false`);
    const identity = await database.execute<{ relation_oid: string | null, }>(`
      SELECT to_regclass(?)::oid::text AS relation_oid
    `, [`${definition.schemaName}.${definition.tableName}`]);
    if (identity.rows[0]?.relation_oid !== definition.relationOid) unavailable();
    const current = await readLiveColumns(database, definition.relationOid);
    if (JSON.stringify(current) !== JSON.stringify(definition.preparedLiveColumns)) schemaChanged();
    const key = await eligibleKey(database, definition.relationOid, current);
    if (!key || JSON.stringify(key) !== JSON.stringify(
      definition.keyColumns.map((column) => column.attributeNumber)
    )) schemaChanged();
  }

  /**
   * Describe the current value.
   */
  public async describe(database: DatabaseExecutor, target: PreparedTarget) {
    await this.authorize(database, target, 'read');
    const definition = nativeState(target).definition;
    const privileges = await columnPrivileges(database, definition.relationOid);
    const visible = definition.columns.filter((column) =>
      privileges.get(column.attributeNumber)?.can_select
    );
    if (definition.keyColumns.some((column) =>
      !privileges.get(column.attributeNumber)?.can_select
    )) unavailable();
    const tableSelect = await hasTablePrivilege(database, definition.relationOid, 'SELECT');
    const tableInsert = await hasTablePrivilege(database, definition.relationOid, 'INSERT');
    const tableDelete = await hasTablePrivilege(database, definition.relationOid, 'DELETE');
    const columns = visible.map((column) => ({
      columnId: column.columnId,
      codec: column.codec,
      editable: column.editable && Boolean(privileges.get(column.attributeNumber)?.can_update),
      key: column.key,
      generated: column.generated
    }));
    const jsonPrivilege = definition.jsonColumn
      ? privileges.get(definition.jsonColumn.attributeNumber)
      : undefined;
    const unstructured = jsonPrivilege?.can_select
      ? definition.unstructuredColumns.map((column) => ({
        columnId: column.columnId,
        codec: column.codec,
        editable: Boolean(jsonPrivilege.can_update),
        key: false,
        generated: false
      }))
      : [];
    return {
      fileId: target.fileId,
      schemaVersion: target.schemaVersion,
      columns: [...columns, ...unstructured],
      operations: {
        update: [...columns, ...unstructured].some((column) => column.editable),
        insert: tableSelect && tableInsert,
        delete: tableSelect && tableDelete
      }
    };
  }

  /**
   * Handle the browse operation.
   */
  public async browse(
    database: DatabaseExecutor,
    target: PreparedTarget,
    limit = 1_000
  ): Promise<PostgreSqlBrowseResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error('PostgreSQL grid browse limit is invalid');
    }
    await this.authorize(database, target, 'read');
    const definition = nativeState(target).definition;
    const privileges = await columnPrivileges(database, definition.relationOid);
    const tableSelect = await hasTablePrivilege(database, definition.relationOid, 'SELECT');
    const visible = definition.columns.filter((column) =>
      privileges.get(column.attributeNumber)?.can_select
    );
    const rank = definition.rankColumn
      && privileges.get(definition.rankColumn.attributeNumber)?.can_select
      ? definition.rankColumn
      : undefined;
    const json = definition.jsonColumn
      && privileges.get(definition.jsonColumn.attributeNumber)?.can_select
      ? definition.jsonColumn
      : undefined;
    if (
      definition.keyColumns.some((column) => !privileges.get(column.attributeNumber)?.can_select)
    ) unavailable();
    const permitted = new Map(visible.map((column) => [column.columnId, column]));
    const useSystemVersion = systemVersion(definition, tableSelect);
    const compiled = compileAuthorizedRead(definition, permitted, useSystemVersion, rank, {
      columnIds: visible.map((column) => column.columnId),
      sorts: [],
      filters: [],
      limit,
      mode: 'current-grid',
      includeSentinel: false
    });
    const readExtras = uniqueColumns([
      ...(json ? [json] : []),
      ...(rank ? [rank] : [])
    ]);
    const readQuery = readExtras.length
      ? compiled.query.replace(
        /^\s*SELECT /,
        `\n      SELECT ${projection(definition, readExtras, false, readExtras, false)}, `
      )
      : compiled.query;
    const result = await database.execute<DatabaseRow>(readQuery, compiled.values);
    const virtualColumns = json ? definition.unstructuredColumns : [];
    return {
      fileId: target.fileId,
      schemaVersion: target.schemaVersion,
      columns: [...compiled.selected.map((column) => ({
        columnId: column.columnId,
        codec: column.codec,
        physicalName: column.columnName,
        editable: column.editable && Boolean(privileges.get(column.attributeNumber)?.can_update),
        key: column.key,
        generated: column.generated
      })), ...virtualColumns.map((column) => ({
        columnId: column.columnId,
        codec: column.codec,
        physicalName: '',
        editable: Boolean(json && privileges.get(json.attributeNumber)?.can_update),
        key: false,
        generated: false
      }))],
      rows: result.rows.map((row) => ({
        ...safeRow(
        target,
        definition,
        row,
        compiled.selected,
        versionForRow(
          target,
          definition,
          row,
          compiled.selected,
          useSystemVersion
        )),
        ...(rank && rankValue(row[rank.columnName]) !== undefined
          ? { rank: rankText(rankValue(row[rank.columnName])!) }
          : {}),
        cells: [
          ...safeRow(
            target,
            definition,
            row,
            compiled.selected,
            versionForRow(target, definition, row, compiled.selected, useSystemVersion)
          ).cells,
          ...unstructuredCells(definition, row)
        ]
      }))
    };
  }

  /**
   * Query the current value.
   */
  public async query(
    database: DatabaseExecutor,
    target: PreparedTarget,
    input: GridQueryInput
  ): Promise<PostgreSqlBrowseResult> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50_000) {
      throw new Error('PostgreSQL authorized query limit is invalid');
    }
    if (!Array.isArray(input.columnIds) || input.columnIds.length < 1
      || input.columnIds.length > 200 || new Set(input.columnIds).size !== input.columnIds.length
      || !Array.isArray(input.sorts) || input.sorts.length > 16
      || !Array.isArray(input.filters) || input.filters.length > 32) {
      validationRejected('The authorized query shape is invalid');
    }
    if (input.maximumResultBytes !== undefined
      && (!Number.isSafeInteger(input.maximumResultBytes)
        || input.maximumResultBytes < 1
        || input.maximumResultBytes > 1_048_576)) {
      validationRejected('The authorized query result budget is invalid');
    }
    await this.authorize(database, target, 'read');
    const definition = nativeState(target).definition;
    const privileges = await columnPrivileges(database, definition.relationOid);
    const tableSelect = await hasTablePrivilege(database, definition.relationOid, 'SELECT');
    const permitted = new Map(definition.columns
      .filter((entry) => privileges.get(entry.attributeNumber)?.can_select)
      .map((entry) => [entry.columnId, entry]));
    const json = definition.jsonColumn
      && privileges.get(definition.jsonColumn.attributeNumber)?.can_select
      ? definition.jsonColumn
      : undefined;
    const virtualIds = new Set(
      (definition.unstructuredColumns || []).map((column) => column.columnId)
    );
    const requestedVirtual = input.columnIds.filter((columnId) => virtualIds.has(columnId));
    const requestedNative = input.columnIds.filter((columnId) => permitted.has(columnId));
    if (requestedNative.length + requestedVirtual.length !== input.columnIds.length
      || (requestedVirtual.length && !json)
      || input.sorts.some((sort) => virtualIds.has(sort.columnId))
      || input.filters.some((filter) => virtualIds.has(filter.columnId))) {
      unavailable();
    }
    if (definition.keyColumns.some((entry) => !privileges.get(entry.attributeNumber)?.can_select)) {
      unavailable();
    }
    const rank = definition.rankColumn
      && privileges.get(definition.rankColumn.attributeNumber)?.can_select
      ? definition.rankColumn
      : undefined;
    const useSystemVersion = systemVersion(definition, tableSelect);
    const compiled = compileAuthorizedRead(definition, permitted, useSystemVersion, rank, {
      ...input,
      columnIds: requestedNative,
      mode: 'authorized-query',
      includeSentinel: true
    });
    const readExtras = uniqueColumns([
      ...(json && requestedVirtual.length ? [json] : []),
      ...(rank ? [rank] : [])
    ]);
    const readQuery = readExtras.length
      ? compiled.query.replace(
        /^\s*SELECT /,
        `\n      SELECT ${projection(definition, readExtras, false, readExtras, false)}, `
      )
      : compiled.query;
    if (input.maximumResultBytes) {
      const measured = await database.execute<{ bytes: string, }>(`
        SELECT COALESCE(sum(octet_length(row_to_json(bounded_row)::text) + 1), 0)::text AS bytes
          FROM (${readQuery}) AS bounded_row
      `, compiled.values);
      const bytes = BigInt(measured.rows[0]?.bytes || '0');
      if (bytes > BigInt(input.maximumResultBytes)) {
        throw new CapabilityResultBudgetExceededError();
      }
    }
    const result = await database.execute<DatabaseRow>(readQuery, compiled.values);
    const truncated = result.rows.length > input.limit;
    return {
      fileId: target.fileId,
      schemaVersion: target.schemaVersion,
      ...(truncated ? { truncated: true } : {}),
      columns: [...compiled.selected.map((column) => ({
        columnId: column.columnId,
        codec: column.codec,
        physicalName: column.columnName,
        editable: column.editable && Boolean(privileges.get(column.attributeNumber)?.can_update),
        key: column.key,
        generated: column.generated
      })), ...(definition.unstructuredColumns || []).filter((column) => (
        requestedVirtual.includes(column.columnId)
      )).map((column) => ({
        columnId: column.columnId,
        codec: column.codec,
        physicalName: '',
        editable: Boolean(json && privileges.get(json.attributeNumber)?.can_update),
        key: false,
        generated: false
      }))],
      rows: result.rows.slice(0, input.limit).map((row) => ({
        ...safeRow(
        target,
        definition,
        row,
        compiled.selected,
        versionForRow(
          target,
          definition,
          row,
          compiled.selected,
          useSystemVersion
        )),
        ...(rank && rankValue(row[rank.columnName]) !== undefined
          ? { rank: rankText(rankValue(row[rank.columnName])!) }
          : {}),
        cells: [
          ...safeRow(
            target,
            definition,
            row,
            compiled.selected,
            versionForRow(target, definition, row, compiled.selected, useSystemVersion)
          ).cells,
          ...unstructuredCells(definition, row).filter((cell) => (
            requestedVirtual.includes(cell.columnId)
          ))
        ]
      }))
    };
  }

  /**
   * Move the row.
   */
  public async moveRow(
    database: DatabaseExecutor,
    target: PreparedTarget,
    input: { rowId: string, beforeRowId?: string, afterRowId?: string, }
  ) {
    await this.authorize(database, target, 'mutate');
    const definition = nativeState(target).definition;
    const rank = definition.rankColumn;
    if (!rank) denied();
    const privileges = await columnPrivileges(database, definition.relationOid);
    if (!privileges.get(rank.attributeNumber)?.can_select
      || !privileges.get(rank.attributeNumber)?.can_update
      || definition.keyColumns.some((column) => !privileges.get(column.attributeNumber)?.can_select)) {
      denied();
    }
    await database.execute(`
      SELECT pg_advisory_xact_lock(hashtextextended('tabular-row-order:' || ?, 0))
    `, [target.fileId]);
    const projected = uniqueColumns([...definition.keyColumns, rank]);
    const result = await database.execute<DatabaseRow>(`
      SELECT ${projection(definition, projected, false, projected, false)}
        FROM ${definition.tableReference}
       ORDER BY ${quoteIdentifier(rank.columnName)} COLLATE "C" NULLS LAST,
                ${definition.keyColumns.map((column) => quoteIdentifier(column.columnName)).join(', ')}
       FOR UPDATE
    `);
    const ordered = result.rows.map((row) => ({
      row,
      rowId: encodeRowId(definition, row),
      rank: rankValue(row[rank.columnName])
    }));
    const moving = ordered.find((entry) => entry.rowId === input.rowId);
    if (!moving) unavailable();
    const remaining = ordered.filter((entry) => entry.rowId !== input.rowId);
    const beforeIndex = input.beforeRowId
      ? remaining.findIndex((entry) => entry.rowId === input.beforeRowId)
      : -1;
    const afterIndex = input.afterRowId
      ? remaining.findIndex((entry) => entry.rowId === input.afterRowId)
      : -1;
    if ((input.beforeRowId && beforeIndex < 0) || (input.afterRowId && afterIndex < 0)) changed();
    if (beforeIndex >= 0 && afterIndex >= 0 && afterIndex !== beforeIndex + 1) changed();
    const insertAt = beforeIndex >= 0 ? beforeIndex + 1 : afterIndex;
    if (insertAt < 0) changed();
    const desired = [...remaining];
    desired.splice(insertAt, 0, moving);
    const ranksUsable = ordered.every((entry) => entry.rank !== undefined)
      && ordered.every((entry) => entry.rank! % RANK_GAP === 0n)
      && new Set(ordered.map((entry) => String(entry.rank))).size === ordered.length;
    const rebalanced = !ranksUsable;
    if (rebalanced) {
      if (BigInt(desired.length + 1) * RANK_GAP >= MAX_RANK) changed();
      for (let index = 0; index < desired.length; index += 1) {
        await updateRank(
          database,
          definition,
          rank,
          desired[index]!.rowId,
          rankText(BigInt(index + 1) * RANK_GAP)
        );
      }
    } else {
      const availableRanks = ordered.map((entry) => entry.rank!);
      for (let index = 0; index < desired.length; index += 1) {
        const entry = desired[index]!;
        const nextRank = availableRanks[index]!;
        if (entry.rank === nextRank) continue;
        await updateRank(database, definition, rank, entry.rowId, rankText(nextRank));
      }
    }
    return { fileId: target.fileId, rebalanced };
  }

  /**
   * Read the current value.
   */
  public async read(
    database: DatabaseExecutor,
    target: PreparedTarget,
    rowId: string,
    columnIds: string[],
    maximumResultBytes?: number
  ) {
    const definition = nativeState(target).definition;
    const selected = columnIds.map((columnId) => definition.columnsById.get(columnId));
    if (selected.some((column) => !column)) return undefined;
    const privileges = await columnPrivileges(database, definition.relationOid);
    if ([...(selected as NativeColumn[]), ...definition.keyColumns].some((column) =>
      !privileges.get(column.attributeNumber)?.can_select
    )) return undefined;
    const keys = decodeRowId(definition, rowId);
    const visible = definition.columns.filter((column) =>
      privileges.get(column.attributeNumber)?.can_select
    );
    const tableSelect = await hasTablePrivilege(database, definition.relationOid, 'SELECT');
    const useSystemVersion = systemVersion(definition, tableSelect);
    const projected = uniqueColumns([
      ...(selected as NativeColumn[]),
      ...definition.keyColumns
    ]);
    const query = `
      SELECT ${projection(definition, projected, useSystemVersion, visible)}
        FROM ${definition.tableReference}
       WHERE ${keyPredicate(definition)}
    `;
    await assertBoundedRead(database, query, keys, maximumResultBytes);
    const result = await database.execute<DatabaseRow>(query, keys);
    if (result.rows.length !== 1) return undefined;
    const safe = safeRow(
      target,
      definition,
      result.rows[0]!,
      projected,
      versionForRow(
        target,
        definition,
        result.rows[0]!,
        projected,
        useSystemVersion
      )
    );
    return {
      rowId,
      version: safe.version,
      cells: (selected as NativeColumn[]).map((column) => ({
        columnId: column.columnId,
        value: typedDatabaseValue(column.codec, result.rows[0]![column.columnName])
      }))
    };
  }

  /**
   * Handle the mutate operation.
   */
  public async mutate(
    database: DatabaseExecutor,
    target: PreparedTarget,
    rows: TargetMutationRow[]
  ): Promise<TargetMutationEffect> {
    const effect: TargetMutationEffect = { rows: [], changes: [] };
    const privileges = await columnPrivileges(
      database,
      nativeState(target).definition.relationOid
    );
    const tableSelect = await hasTablePrivilege(
      database,
      nativeState(target).definition.relationOid,
      'SELECT'
    );
    for (const requested of [...rows].sort((left, right) =>
      (left.rowId || '').localeCompare(right.rowId || '')
    )) {
      const operation = requested.operation || (requested.rowId ? 'update' : 'insert');
      if (operation === 'insert') {
        if (!tableSelect) denied();
        await this.insert(database, target, requested, effect, privileges);
      } else if (operation === 'delete') {
        if (!tableSelect) denied();
        await this.delete(database, target, requested, effect);
      } else {
        await this.update(database, target, requested, effect, privileges, tableSelect);
      }
    }
    return effect;
  }

  /**
   * Apply one authorized catalog-backed row update with optimistic locking.
   */
  private async update(
    database: DatabaseExecutor,
    target: PreparedTarget,
    requested: TargetMutationRow,
    effect: TargetMutationEffect,
    privileges: Map<number, Pick<NativeColumnPrivilege, 'can_select' | 'can_update'>>,
    tableSelect: boolean
  ) {
    const definition = nativeState(target).definition;
    const ordered = orderedPatch(requested.patch);
    const nativeOrdered = ordered.filter((entry) => definition.columnsById.has(entry.columnId));
    const unstructuredOrdered = ordered.filter((entry) => definition.unstructuredById.has(entry.columnId));
    if (nativeOrdered.length + unstructuredOrdered.length !== ordered.length
      || nativeOrdered.some((entry) => !definition.columnsById.get(entry.columnId)?.editable)
      || (unstructuredOrdered.length && !definition.jsonColumn)) {
      validationRejected('Stable key and read-only columns cannot be changed');
    }
    const changedColumns = nativeOrdered.map((entry) => definition.columnsById.get(entry.columnId)!);
    const preconditionColumns = (requested.preconditions || []).flatMap((entry) => {
      const column = definition.columnsById.get(entry.columnId);
      return column ? [column] : definition.unstructuredById.has(entry.columnId) ? [] : [undefined];
    });
    if (preconditionColumns.some((column) => !column)) changed();
    const needed = uniqueColumns([
      ...definition.keyColumns,
      ...changedColumns,
      ...(preconditionColumns as NativeColumn[]),
      ...(unstructuredOrdered.length && definition.jsonColumn ? [definition.jsonColumn] : [])
    ]);
    if (needed.some((column) => !privileges.get(column.attributeNumber)?.can_select)
      || changedColumns.some((column) => !privileges.get(column.attributeNumber)?.can_update)
      || (unstructuredOrdered.length
        && !privileges.get(definition.jsonColumn!.attributeNumber)?.can_update)) {
      denied();
    }
    if (!tableSelect && requested.expectedIncarnation) denied();
    const visible = definition.columns.filter((column) =>
      privileges.get(column.attributeNumber)?.can_select
    );
    //Hidden generated row keys are identity, not spreadsheet columns. Keep
    // them in the locked projection so version tokens are computed against the
    // same stable row ID that browse/query returned to the caller.
    const projected = uniqueColumns([
      ...definition.keyColumns,
      ...(tableSelect ? definition.columns : visible),
      ...(definition.jsonColumn
        && privileges.get(definition.jsonColumn.attributeNumber)?.can_select
        ? [definition.jsonColumn]
        : [])
    ]);
    const useSystemVersion = systemVersion(definition, tableSelect);
    const current = await this.lockRow(
      database,
      definition,
      requested.rowId!,
      projected,
      useSystemVersion,
      versionColumns(definition, visible)
    );
    if (!current) unavailable();
    const priorVersion = versionForRow(
      target,
      definition,
      current,
      projected,
      useSystemVersion
    );
    if (requested.expectedVersion && requested.expectedVersion !== priorVersion) changed();
    assertPreconditions(definition, current, requested.preconditions || []);
    const assignments = nativeOrdered.map((entry) =>
      `${quoteIdentifier(definition.columnsById.get(entry.columnId)!.columnName)} = ?`
    );
    const updatedJson = unstructuredOrdered.length
      ? applyUnstructuredPatch(
        jsonObject(current[definition.jsonColumn!.columnName]),
        unstructuredOrdered
      )
      : undefined;
    if (updatedJson) assignments.push(`${quoteIdentifier(definition.jsonColumn!.columnName)} = ?::jsonb`);
    const keys = decodeRowId(definition, requested.rowId!);
    const updated = await database.execute<DatabaseRow>(`
      UPDATE ${definition.tableReference}
       SET ${assignments.join(', ')}
       WHERE ${keyPredicate(definition)}
      RETURNING ${projection(
        definition,
        projected,
        useSystemVersion,
        versionColumns(definition, visible)
      )}
    `, [
      ...nativeOrdered.map((entry) => databaseValue(entry.value)),
      ...(updatedJson ? [JSON.stringify(updatedJson)] : []),
      ...keys
    ]);
    if (updated.affectedRows !== 1 || updated.rows.length !== 1) changed();
    const next = updated.rows[0]!;
    const nextRowId = encodeRowId(definition, next);
    if (nextRowId !== requested.rowId) changed();
    effect.rows.push({
      rowId: requested.rowId!,
      operation: 'update',
      priorVersion,
      resultingVersion: versionForRow(
        target,
        definition,
        next,
        projected,
        useSystemVersion
      ),
      incarnation: rowIncarnation(target, requested.rowId!)
    });
    for (const entry of nativeOrdered) {
      const column = definition.columnsById.get(entry.columnId)!;
      effect.changes.push({
        rowId: requested.rowId!,
        columnId: entry.columnId,
        before: typedDatabaseValue(column.codec, current[column.columnName]),
        after: typedDatabaseValue(column.codec, next[column.columnName])
      });
    }
    const priorJson = definition.jsonColumn
      ? jsonObject(current[definition.jsonColumn.columnName])
      : {};
    const nextJson = definition.jsonColumn
      ? jsonObject(next[definition.jsonColumn.columnName])
      : {};
    for (const entry of unstructuredOrdered) {
      effect.changes.push({
        rowId: requested.rowId!,
        columnId: entry.columnId,
        before: typedUnstructuredValue(priorJson[entry.columnId]),
        after: typedUnstructuredValue(nextJson[entry.columnId])
      });
    }
  }

  /**
   * Insert one authorized catalog-backed row and capture its stable identity.
   */
  private async insert(
    database: DatabaseExecutor,
    target: PreparedTarget,
    requested: TargetMutationRow,
    effect: TargetMutationEffect,
    privileges: Map<number, Pick<NativeColumnPrivilege, 'can_select' | 'can_update' | 'can_insert'>>
  ) {
    const definition = nativeState(target).definition;
    const ordered = orderedPatch(requested.patch);
    if (!ordered.length) validationRejected('A row requires at least one typed value');
    const nativeOrdered = ordered.filter((entry) => definition.columnsById.has(entry.columnId));
    const unstructuredOrdered = ordered.filter((entry) => definition.unstructuredById.has(entry.columnId));
    if (nativeOrdered.length + unstructuredOrdered.length !== ordered.length
      || (unstructuredOrdered.length && !definition.jsonColumn)) {
      validationRejected('The inserted row contains an unavailable column');
    }
    const patch = new Map(nativeOrdered.map((entry) => [entry.columnId, entry]));
    if (definition.keyColumns.some((column) =>
      !patch.has(column.columnId) && !column.serverDefault
    )) {
      validationRejected('Every stable key column is required for a new row');
    }
    const visibleColumns = nativeOrdered.map((entry) => definition.columnsById.get(entry.columnId)!);
    const restoredKeys = requested.rowId
      ? definition.keyColumns.filter((column) => !patch.has(column.columnId))
      : [];
    const decodedRowId = restoredKeys.length ? decodeRowId(definition, requested.rowId!) : [];
    const restoredValues = restoredKeys.map((column) =>
      decodedRowId[definition.keyColumns.indexOf(column)]!
    );
    const rank = definition.rankColumn;
    const rankPrivilege = rank ? privileges.get(rank.attributeNumber) : undefined;
    const appendedRank = rank && rankPrivilege?.can_select
      && rankPrivilege.can_update && rankPrivilege.can_insert
      ? requested.insertRank
        ? await requestedRank(database, target, definition, rank, requested.insertRank)
        : await appendRank(database, target, definition, rank)
      : undefined;
    if (requested.insertRank && !appendedRank) denied();
    const jsonPrivilege = definition.jsonColumn
      ? privileges.get(definition.jsonColumn.attributeNumber)
      : undefined;
    if (unstructuredOrdered.length && (!jsonPrivilege?.can_select || !jsonPrivilege.can_insert)) denied();
    const insertedJson = unstructuredOrdered.length
      ? applyUnstructuredPatch({}, unstructuredOrdered)
      : undefined;
    const columns = [
      ...restoredKeys,
      ...visibleColumns,
      ...(insertedJson ? [definition.jsonColumn!] : []),
      ...(appendedRank ? [rank!] : [])
    ];
    const values = [
      ...restoredValues,
      ...nativeOrdered.map((entry) => databaseValue(entry.value)),
      ...(insertedJson ? [JSON.stringify(insertedJson)] : []),
      ...(appendedRank ? [appendedRank] : [])
    ];
    const inserted = await database.execute<DatabaseRow>(`
      INSERT INTO ${definition.qualifiedName} (
        ${columns.map((column) => quoteIdentifier(column.columnName)).join(', ')}
      ) VALUES (${columns.map(() => '?').join(', ')})
      RETURNING ${projection(
        definition,
        uniqueColumns([
          ...definition.keyColumns,
          ...definition.columns,
          ...(definition.jsonColumn ? [definition.jsonColumn] : []),
          ...(definition.rankColumn ? [definition.rankColumn] : [])
        ]),
        systemVersion(definition, true),
        versionColumns(definition, definition.columns)
      )}
    `, values);
    if (inserted.affectedRows !== 1 || inserted.rows.length !== 1) changed();
    const next = inserted.rows[0]!;
    const rowId = encodeRowId(definition, next);
    if (requested.rowId && requested.rowId !== rowId) changed();
    effect.rows.push({
      rowId,
      operation: 'insert',
      priorVersion: tombstoneVersion(target, rowId),
      resultingVersion: systemVersion(definition, true)
        ? rowVersion(target, rowId, next)
        : visibleRowVersion(target, rowId, next, definition.columns),
      incarnation: rowIncarnation(target, rowId)
    });
    for (const column of definition.storedColumns) {
      effect.changes.push({
        rowId,
        columnId: column.columnId,
        before: { type: 'null' },
        after: typedDatabaseValue(column.codec, next[column.columnName])
      });
    }
    const json = definition.jsonColumn ? jsonObject(next[definition.jsonColumn.columnName]) : {};
    for (const column of definition.unstructuredColumns) {
      effect.changes.push({
        rowId,
        columnId: column.columnId,
        before: { type: 'null' },
        after: typedUnstructuredValue(json[column.columnId])
      });
    }
  }

  /**
   * Delete one authorized catalog-backed row while retaining reversal values.
   */
  private async delete(
    database: DatabaseExecutor,
    target: PreparedTarget,
    requested: TargetMutationRow,
    effect: TargetMutationEffect
  ) {
    const definition = nativeState(target).definition;
    const current = await this.lockRow(
      database,
      definition,
      requested.rowId!,
      uniqueColumns([
        ...definition.columns,
        ...(definition.jsonColumn ? [definition.jsonColumn] : [])
      ]),
      systemVersion(definition, true),
      versionColumns(definition, definition.columns)
    );
    if (!current) unavailable();
    const priorVersion = systemVersion(definition, true)
      ? rowVersion(target, requested.rowId!, current)
      : visibleRowVersion(target, requested.rowId!, current, definition.columns);
    if (requested.expectedVersion && requested.expectedVersion !== priorVersion) changed();
    assertPreconditions(definition, current, requested.preconditions || []);
    const deleted = await database.execute(`
      DELETE FROM ${definition.tableReference}
       WHERE ${keyPredicate(definition)}
    `, decodeRowId(definition, requested.rowId!));
    if (deleted.affectedRows !== 1) changed();
    effect.rows.push({
      rowId: requested.rowId!,
      operation: 'delete',
      priorVersion,
      resultingVersion: tombstoneVersion(target, requested.rowId!),
      incarnation: rowIncarnation(target, requested.rowId!)
    });
    for (const column of definition.storedColumns) {
      effect.changes.push({
        rowId: requested.rowId!,
        columnId: column.columnId,
        before: typedDatabaseValue(column.codec, current[column.columnName]),
        after: { type: 'null' }
      });
    }
    const deletedJson = definition.jsonColumn
      ? jsonObject(current[definition.jsonColumn.columnName])
      : {};
    for (const column of definition.unstructuredColumns) {
      effect.changes.push({
        rowId: requested.rowId!,
        columnId: column.columnId,
        before: typedUnstructuredValue(deletedJson[column.columnId]),
        after: { type: 'null' }
      });
    }
  }

  /**
   * Handle the lock row operation.
   */
  private async lockRow(
    database: DatabaseExecutor,
    definition: NativeDefinition,
    rowId: string,
    columns: NativeColumn[],
    includeVersion: boolean,
    visibleVersionColumns: NativeColumn[] = columns
  ) {
    const result = await database.execute<DatabaseRow>(`
      SELECT ${projection(definition, columns, includeVersion, visibleVersionColumns)}
        FROM ${definition.tableReference}
       WHERE ${keyPredicate(definition)}
       FOR UPDATE
    `, decodeRowId(definition, rowId));
    if (result.rows.length > 1) changed();
    return result.rows[0];
  }
}

/**
 * Assert the bounded read.
 */
async function assertBoundedRead(
  database: DatabaseExecutor,
  query: string,
  values: Value[],
  maximumResultBytes?: number
) {
  if (maximumResultBytes === undefined) return;
  if (!Number.isSafeInteger(maximumResultBytes)
    || maximumResultBytes < 1
    || maximumResultBytes > 1_048_576) {
    throw new Error('Capability result budget is invalid');
  }
  const measured = await database.execute<{ bytes: string, }>(`
    SELECT COALESCE(sum(octet_length(row_to_json(bounded_row)::text) + 1), 0)::text AS bytes
      FROM (${query}) AS bounded_row
  `, values);
  if (BigInt(measured.rows[0]?.bytes || '0') > BigInt(maximumResultBytes)) {
    throw new CapabilityResultBudgetExceededError();
  }
}

/**
 * Read the live columns.
 */
async function readLiveColumns(database: DatabaseExecutor, relationOid: string) {
  const result = await database.execute<LiveColumn>(`
    SELECT a.attnum AS attribute_number, a.attname AS name,
           t.typname AS type_name, format_type(a.atttypid, a.atttypmod) AS formatted_type,
           NOT a.attnotnull AS nullable, a.attidentity AS identity_kind,
           a.attgenerated AS generated_kind, d.oid IS NOT NULL AS has_default
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = ?::oid
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum
  `, [relationOid]);
  return result.rows.map((column) => ({
    ...column,
    attribute_number: Number(column.attribute_number),
    nullable: Boolean(column.nullable),
    has_default: Boolean(column.has_default)
  }));
}

/**
 * Return the hidden columns result.
 */
async function hiddenColumns(database: DatabaseExecutor, fileId: string) {
  const result = await database.execute<{
    attribute_number: string | number,
    hidden_purpose: string,
  }>(`
    SELECT c.attribute_number, m.hidden_purpose
      FROM tabular.column_metadata m
      JOIN tabular.catalog_columns c ON c.id = m.catalog_column_id
     WHERE m.object_id = ? AND m.hidden AND m.catalog_column_id IS NOT NULL
       AND c.state = 'current'
  `, [fileId]);
  return new Map(result.rows.map((row) => [
    Number(row.attribute_number),
    row.hidden_purpose
  ]));
}

/**
 * Read the unstructured columns.
 */
async function readUnstructuredColumns(database: DatabaseExecutor, fileId: string) {
  const result = await database.execute<{ column_id: string, }>(`
    SELECT column_id
      FROM tabular.column_metadata
     WHERE object_id = ? AND storage_kind = 'unstructured-json' AND NOT hidden
     ORDER BY created_at, column_id
  `, [fileId]);
  return result.rows.map((row) => ({
    columnId: row.column_id,
    codec: 'text' as const
  }));
}

/**
 * Return the eligible key result.
 */
async function eligibleKey(
  database: DatabaseExecutor,
  relationOid: string,
  live: LiveColumn[]
) {
  const keys = await database.execute<{
    primary_key: boolean,
    key_numbers: string,
    key_count: string | number,
  }>(`
    SELECT i.indisprimary AS primary_key, i.indkey::text AS key_numbers,
           i.indnkeyatts AS key_count
      FROM pg_index i
      JOIN pg_constraint c
        ON c.conindid = i.indexrelid AND c.conrelid = i.indrelid
     WHERE i.indrelid = ?::oid
       AND c.contype IN ('p', 'u') AND c.convalidated AND NOT c.condeferrable
       AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
       AND i.indpred IS NULL AND i.indexprs IS NULL
       AND i.indnkeyatts BETWEEN 1 AND 8
     ORDER BY i.indisprimary DESC, c.oid
  `, [relationOid]);
  const byNumber = new Map(live.map((column) => [column.attribute_number, column]));
  for (const key of keys.rows) {
    const numbers = key.key_numbers.trim().split(/\s+/).slice(0, Number(key.key_count)).map(Number);
    if (numbers.length && numbers.every((number) => {
      const column = byNumber.get(number);
      return column && !column.nullable && !column.generated_kind && Boolean(codecFor(column.type_name));
    })) return numbers;
  }
  return undefined;
}

/**
 * Return the codec for result.
 */
function codecFor(typeName: string): PostgreSqlColumnCodec | undefined {
  if (['text', 'varchar', 'bpchar', 'uuid', 'name'].includes(typeName)) return 'text';
  if (['int2', 'int4', 'int8'].includes(typeName)) return 'integer';
  if (typeName === 'numeric') return 'decimal';
  if (typeName === 'bool') return 'boolean';
  if (typeName === 'date') return 'date';
  if (typeName === 'time') return 'time';
  if (['timestamp', 'timestamptz'].includes(typeName)) return 'timestamp';
  if (['json', 'jsonb'].includes(typeName)) return 'json';
  return undefined;
}

/**
 * Return the projection result.
 */
function projection(
  definition: NativeDefinition,
  columns: NativeColumn[],
  includeVersion: boolean,
  visibleVersionColumns: NativeColumn[] = columns,
  includeOpaqueVersion = true
) {
  return [
    ...(includeOpaqueVersion
      ? [includeVersion
        ? `xmin::text AS ${quoteIdentifier(definition.versionColumnAlias)}`
        : visibleVersionProjection(definition, visibleVersionColumns)]
      : []),
    ...columns.map((column) => column.codec === 'json'
      ? `${quoteIdentifier(column.columnName)}::text AS ${quoteIdentifier(column.columnName)}`
      : column.codec === 'date'
        ? `to_char(${quoteIdentifier(column.columnName)}, 'YYYY-MM-DD') AS ${quoteIdentifier(column.columnName)}`
        : column.codec === 'time'
          ? `to_char(${quoteIdentifier(column.columnName)}, 'HH24:MI:SS.US') AS ${quoteIdentifier(column.columnName)}`
          : column.codec === 'timestamp'
            ? `${quoteIdentifier(column.columnName)}::text AS ${quoteIdentifier(column.columnName)}`
        : quoteIdentifier(column.columnName))
  ].join(', ');
}

/**
 * Compiles every catalog-backed grid/export read through one allowlisted path.
 */
function compileAuthorizedRead(
  definition: NativeDefinition,
  permitted: Map<string, NativeColumn>,
  includeVersion: boolean,
  rank: NativeColumn | undefined,
  input: AuthorizedReadInput
) {
  //Resolve the requested projection exclusively from columns already proven
  // selectable for this PostgreSQL role.
  const columns = input.columnIds.map((columnId) => permitted.get(columnId));
  if (columns.some((column) => !column)) unavailable();
  const selected = columns as NativeColumn[];

  //Validate all user-shaped clauses before composing SQL, and bind values
  // independently from the allowlisted physical identifiers.
  const sorts = validatedSorts(input.sorts, permitted);
  const { clauses, values } = validatedFilters(input.filters, permitted);
  const projected = uniqueColumns([...definition.keyColumns, ...selected]);
  const ordered = input.mode === 'current-grid'
    ? currentGridOrder(definition, rank)
    : queryOrder(definition, sorts, rank);
  const queryLimit = input.limit + (input.includeSentinel ? 1 : 0);

  return {
    selected,
    values,
    query: `
      SELECT ${projection(
        definition,
        projected,
        includeVersion,
        versionColumns(definition, [...permitted.values()])
      )}
        FROM ${definition.tableReference}
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY ${ordered}
       LIMIT ${queryLimit}
    `
  };
}

/**
 * Preserves the established rank/key ordering of the default current grid.
 */
function currentGridOrder(definition: NativeDefinition, rank: NativeColumn | undefined) {
  return [
    ...(rank ? [`${quoteIdentifier(rank.columnName)} COLLATE "C" NULLS LAST`] : []),
    ...definition.keyColumns.map((column) => quoteIdentifier(column.columnName))
  ].join(', ');
}

/**
 * Return the validated sorts result.
 */
function validatedSorts(
  sorts: GridSort[],
  permitted: Map<string, NativeColumn>
) {
  const seen = new Set<string>();
  return sorts.map((sort) => {
    if (!sort || typeof sort.columnId !== 'string'
      || (sort.direction !== 'asc' && sort.direction !== 'desc')
      || seen.has(sort.columnId)) {
      validationRejected('The authorized sort is invalid');
    }
    const column = permitted.get(sort.columnId);
    if (!column) unavailable();
    seen.add(sort.columnId);
    return { column, direction: sort.direction };
  });
}

/**
 * Return the validated filters result.
 */
function validatedFilters(
  filters: GridFilter[],
  permitted: Map<string, NativeColumn>
) {
  const allowed = new Set<GridFilter['operation']>(['=', '!=', 'like', '<', '<=', '>', '>=']);
  const values: Value[] = [];
  const clauses = filters.map((filter) => {
    if (!filter || typeof filter.columnId !== 'string' || !allowed.has(filter.operation)) {
      validationRejected('The authorized filter is invalid');
    }
    const column = permitted.get(filter.columnId);
    if (!column) unavailable();
    const identifier = quoteIdentifier(column.columnName);
    if (filter.value === null) {
      if (filter.operation === '=') return `${identifier} IS NULL`;
      if (filter.operation === '!=') return `${identifier} IS NOT NULL`;
      validationRejected('Null filters support equality only');
    }
    if (filter.operation === 'like') {
      if (typeof filter.value !== 'string') validationRejected('LIKE filters require text');
      values.push(`%${filter.value.replace(/[\\%_]/g, (token) => `\\${token}`)}%`);
      return `${identifier}::text LIKE ? ESCAPE '\\'`;
    }
    values.push(filterValue(column.codec, filter.value));
    return `${identifier} ${filter.operation === '!=' ? '<>' : filter.operation} ?`;
  });
  return { clauses, values };
}

/**
 * Filter the value.
 */
function filterValue(codec: PostgreSqlColumnCodec, value: Exclude<GridFilter['value'], null>): Value {
  if (codec === 'boolean') {
    if (typeof value !== 'boolean') validationRejected('Boolean filters require a boolean');
    return value;
  }
  if (codec === 'integer') {
    const token = String(value);
    if (!/^-?\d+$/.test(token)) validationRejected('Integer filters require an integer');
    return token;
  }
  if (codec === 'decimal') {
    const token = String(value);
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) validationRejected('Decimal filters require a number');
    return token;
  }
  if (codec === 'json') {
    if (typeof value !== 'string') validationRejected('JSON filters require canonical JSON text');
    try { JSON.parse(value); } catch { validationRejected('JSON filters require canonical JSON text'); }
    return value;
  }
  if (typeof value !== 'string') validationRejected('This filter requires text');
  if (/\u0000/.test(value)) validationRejected('Filter text cannot contain NUL');
  return value;
}

/**
 * Query the order.
 */
function queryOrder(
  definition: NativeDefinition,
  sorts: Array<{ column: NativeColumn, direction: 'asc' | 'desc', }>,
  rank: NativeColumn | undefined
) {
  const ordered = new Set(sorts.map((sort) => sort.column.columnId));
  const clauses = sorts.map(({ column, direction }) => {
    const identifier = quoteIdentifier(column.columnName);
    const expression = column.collatable ? `${identifier} COLLATE "C"` : identifier;
    return `${expression} ${direction.toUpperCase()} NULLS LAST`;
  });
  if (!sorts.length && rank && !ordered.has(rank.columnId)) {
    clauses.push(`${quoteIdentifier(rank.columnName)} COLLATE "C" ASC NULLS LAST`);
    ordered.add(rank.columnId);
  }
  for (const key of definition.keyColumns) {
    if (ordered.has(key.columnId)) continue;
    const identifier = quoteIdentifier(key.columnName);
    clauses.push(`${key.collatable ? `${identifier} COLLATE "C"` : identifier} ASC NULLS LAST`);
  }
  return clauses.join(', ');
}

/**
 * Return the key predicate result.
 */
function keyPredicate(definition: NativeDefinition) {
  return definition.keyColumns.map((column) =>
    `${quoteIdentifier(column.columnName)} IS NOT DISTINCT FROM ?`
  ).join(' AND ');
}

/**
 * Return the append rank result.
 */
async function appendRank(
  database: DatabaseExecutor,
  target: PreparedTarget,
  definition: NativeDefinition,
  rank: NativeColumn
) {
  await database.execute(`
    SELECT pg_advisory_xact_lock(hashtextextended('tabular-row-order:' || ?, 0))
  `, [target.fileId]);
  const projected = uniqueColumns([...definition.keyColumns, rank]);
  const current = await database.execute<DatabaseRow>(`
    SELECT ${projection(definition, projected, false, projected, false)}
      FROM ${definition.tableReference}
     ORDER BY ${quoteIdentifier(rank.columnName)} COLLATE "C" NULLS LAST,
              ${definition.keyColumns.map((column) => quoteIdentifier(column.columnName)).join(', ')}
     FOR UPDATE
  `);
  const ordered = current.rows.map((row) => ({
    rowId: encodeRowId(definition, row),
    rank: rankValue(row[rank.columnName])
  }));
  const distinct = new Set(ordered.map((entry) => String(entry.rank))).size === ordered.length;
  const last = ordered.at(-1)?.rank;
  if (distinct && ordered.every((entry) => entry.rank !== undefined)
    && (last || 0n) + RANK_GAP < MAX_RANK) {
    return rankText((last || 0n) + RANK_GAP);
  }
  if (BigInt(ordered.length + 2) * RANK_GAP >= MAX_RANK) changed();
  for (let index = 0; index < ordered.length; index += 1) {
    await updateRank(
      database,
      definition,
      rank,
      ordered[index]!.rowId,
      rankText(BigInt(index + 1) * RANK_GAP)
    );
  }
  return rankText(BigInt(ordered.length + 1) * RANK_GAP);
}

/**
 * Return the requested rank result.
 */
async function requestedRank(
  database: DatabaseExecutor,
  target: PreparedTarget,
  definition: NativeDefinition,
  rank: NativeColumn,
  requested: string
) {
  const requestedValue = rankValue(requested);
  if (requestedValue === undefined || requestedValue <= 0n || requestedValue >= MAX_RANK) {
    validationRejected('The hidden spreadsheet row rank is invalid');
  }
  await database.execute(`
    SELECT pg_advisory_xact_lock(hashtextextended('tabular-row-order:' || ?, 0))
  `, [target.fileId]);
  const projected = uniqueColumns([...definition.keyColumns, rank]);
  const current = await database.execute<DatabaseRow>(`
    SELECT ${projection(definition, projected, false, projected, false)}
      FROM ${definition.tableReference}
     ORDER BY ${quoteIdentifier(rank.columnName)} COLLATE "C" NULLS LAST,
              ${definition.keyColumns.map((column) => quoteIdentifier(column.columnName)).join(', ')}
     FOR UPDATE
  `);
  const ordered = current.rows.map((row) => ({
    rowId: encodeRowId(definition, row),
    rank: rankValue(row[rank.columnName])
  }));
  const usable = ordered.every((entry) => entry.rank !== undefined)
    && new Set(ordered.map((entry) => String(entry.rank))).size === ordered.length;
  if (!usable) {
    if (BigInt(ordered.length + 2) * RANK_GAP >= MAX_RANK) changed();
    for (let index = 0; index < ordered.length; index += 1) {
      await updateRank(
        database,
        definition,
        rank,
        ordered[index]!.rowId,
        rankText(BigInt(index + 1) * RANK_GAP)
      );
    }
  }
  if (ordered.some((entry, index) => (
    (usable ? entry.rank : BigInt(index + 1) * RANK_GAP) === requestedValue
  ))) {
    changed();
  }
  return rankText(requestedValue);
}

/**
 * Update the rank.
 */
async function updateRank(
  database: DatabaseExecutor,
  definition: NativeDefinition,
  rank: NativeColumn,
  rowId: string,
  value: string
) {
  const updated = await database.execute(`
    UPDATE ${definition.tableReference}
       SET ${quoteIdentifier(rank.columnName)} = ?
     WHERE ${keyPredicate(definition)}
  `, [value, ...decodeRowId(definition, rowId)]);
  if (updated.affectedRows !== 1) changed();
}

/**
 * Return the rank value result.
 */
function rankValue(value: unknown) {
  if (typeof value !== 'string' || !new RegExp(`^[0-9]{${RANK_WIDTH}}$`).test(value)) {
    return undefined;
  }
  return BigInt(value);
}

/**
 * Return the rank text result.
 */
function rankText(value: bigint) {
  if (value <= 0n || value >= MAX_RANK) changed();
  return value.toString().padStart(RANK_WIDTH, '0');
}

/**
 * Report the safe row condition.
 */
function safeRow(
  target: PreparedTarget,
  definition: NativeDefinition,
  row: DatabaseRow,
  columns: NativeColumn[] = definition.columns,
  version = rowVersion(target, encodeRowId(definition, row), row)
) {
  const rowId = encodeRowId(definition, row);
  return {
    rowId,
    version,
    cells: columns.map((column) => ({
      columnId: column.columnId,
      value: typedDatabaseValue(column.codec, row[column.columnName])
    }))
  };
}

/**
 * Return the unstructured cells result.
 */
function unstructuredCells(definition: NativeDefinition, row: DatabaseRow): CellPatch[] {
  if (!definition.jsonColumn) return [];
  const values = jsonObject(row[definition.jsonColumn.columnName]);
  return definition.unstructuredColumns.map((column) => ({
    columnId: column.columnId,
    value: Object.hasOwn(values, column.columnId) && values[column.columnId] !== null
      ? { type: 'text', value: String(values[column.columnId]) }
      : { type: 'null' }
  }));
}

/**
 * Return the JSON object result.
 */
function jsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>) }
      : {};
  } catch {
    return {};
  }
}

/**
 * Apply the unstructured patch.
 */
function applyUnstructuredPatch(
  source: Record<string, unknown>,
  patch: CellPatch[]
) {
  const next = { ...source };
  for (const entry of patch) {
    if (entry.value.type === 'null') delete next[entry.columnId];
    else next[entry.columnId] = entry.value.value;
  }
  return next;
}

/**
 * Return the typed unstructured value result.
 */
function typedUnstructuredValue(value: unknown): TypedCellValue {
  return value === null || typeof value === 'undefined'
    ? { type: 'null' }
    : { type: 'text', value: String(value) };
}

/**
 * Return the column privileges result.
 */
async function columnPrivileges(database: DatabaseExecutor, relationOid: string) {
  const result = await database.execute<NativeColumnPrivilege>(`
    SELECT a.attnum AS attribute_number,
           has_column_privilege(current_user, a.attrelid, a.attnum, 'SELECT') AS can_select,
           has_column_privilege(current_user, a.attrelid, a.attnum, 'UPDATE') AS can_update,
           has_column_privilege(current_user, a.attrelid, a.attnum, 'INSERT') AS can_insert
      FROM pg_attribute a
     WHERE a.attrelid = ?::oid AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum
  `, [relationOid]);
  return new Map(result.rows.map((row) => [Number(row.attribute_number), {
    can_select: Boolean(row.can_select),
    can_update: Boolean(row.can_update),
    can_insert: Boolean(row.can_insert)
  }]));
}

/**
 * Report whether the current value has table privilege.
 */
async function hasTablePrivilege(
  database: DatabaseExecutor,
  relationOid: string,
  privilege: 'SELECT' | 'INSERT' | 'DELETE'
) {
  const result = await database.execute<{ allowed: boolean, }>(`
    SELECT has_table_privilege(current_user, ?::oid, ?) AS allowed
  `, [relationOid, privilege]);
  return Boolean(result.rows[0]?.allowed);
}

/**
 * Encode the row id.
 */
function encodeRowId(definition: NativeDefinition, row: DatabaseRow) {
  const values = definition.keyColumns.map((column) =>
    typedDatabaseValue(column.codec, row[column.columnName])
  );
  const encoded = `row_${Buffer.from(JSON.stringify(values)).toString('base64url')}`;
  if (encoded.length > 260) unavailable();
  return encoded;
}

/**
 * Decode the row id.
 */
function decodeRowId(definition: NativeDefinition, rowId: string): Value[] {
  try {
    if (!rowId.startsWith('row_')) throw new Error('invalid');
    const parsed = JSON.parse(Buffer.from(rowId.slice(4), 'base64url').toString('utf8')) as TypedCellValue[];
    if (!Array.isArray(parsed) || parsed.length !== definition.keyColumns.length) throw new Error('invalid');
    return parsed.map((value, index) => {
      const column = definition.keyColumns[index]!;
      if (!value || value.type === 'null' || value.type !== column.codec) throw new Error('invalid');
      return databaseValue(value);
    });
  } catch {
    unavailable();
  }
}

/**
 * Return the row version result.
 */
function rowVersion(target: PreparedTarget, rowId: string, row: DatabaseRow) {
  const xmin = String(row[nativeState(target).definition.versionColumnAlias] || '');
  if (!/^[0-9]+$/.test(xmin)) throw new Error('PostgreSQL row version was unavailable');
  return `ver_${createHash('sha256')
    .update(JSON.stringify([target.fileId, target.schemaVersion, rowId, xmin]))
    .digest('base64url')}`;
}

/**
 * Return the visible row version result.
 */
function visibleRowVersion(
  target: PreparedTarget,
  rowId: string,
  row: DatabaseRow,
  _columns: NativeColumn[]
) {
  const visibleHash = String(row[nativeState(target).definition.versionColumnAlias] || '');
  if (!/^[a-f0-9]{64}$/.test(visibleHash)) {
    throw new Error('PostgreSQL visible row version was unavailable');
  }
  return `ver_${createHash('sha256')
    .update(JSON.stringify([
      target.fileId,
      target.schemaVersion,
      rowId,
      visibleHash
    ]))
    .digest('base64url')}`;
}

/**
 * Return the visible version projection result.
 */
function visibleVersionProjection(
  definition: NativeDefinition,
  columns: NativeColumn[]
) {
  const row = `ROW(${columns.map((column) =>
    quoteIdentifier(column.columnName)).join(', ')})::text`;
  return `(
    md5('tabular-visible-v1-a:' || ${row})
    || md5('tabular-visible-v1-b:' || ${row})
  ) AS ${quoteIdentifier(definition.versionColumnAlias)}`;
}

/**
 * Return the version columns result.
 */
function versionColumns(definition: NativeDefinition, visible: NativeColumn[]) {
  return uniqueColumns([
    ...visible,
    ...(definition.jsonColumn ? [definition.jsonColumn] : [])
  ]);
}

/**
 * Return the unused version column alias result.
 */
function unusedVersionColumnAlias(live: LiveColumn[]) {
  const used = new Set(live.map((column) => column.name));
  for (let index = 0; index <= live.length; index += 1) {
    const candidate = `__tabular_internal_version_${index}__`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('A collision-free internal version alias was unavailable');
}

/**
 * Return the version for row result.
 */
function versionForRow(
  target: PreparedTarget,
  definition: NativeDefinition,
  row: DatabaseRow,
  columns: NativeColumn[],
  tableSelect: boolean
) {
  const rowId = encodeRowId(definition, row);
  return tableSelect
    ? rowVersion(target, rowId, row)
    : visibleRowVersion(target, rowId, row, columns);
}

/**
 * Return the system version result.
 */
function systemVersion(definition: NativeDefinition, tableSelect: boolean) {
  //The owned rank column is presentation state. Its updates must not create
  // false data-edit conflicts, so ordered tables version caller-visible values.
  return tableSelect && !definition.rankColumn;
}

/**
 * Return the row incarnation result.
 */
function rowIncarnation(target: PreparedTarget, rowId: string) {
  return `inc_${createHash('sha256')
    .update(JSON.stringify([target.fileId, target.schemaVersion, rowId]))
    .digest('base64url')}`;
}

/**
 * Return the tombstone version result.
 */
function tombstoneVersion(target: PreparedTarget, rowId: string) {
  return `ver_${createHash('sha256')
    .update(`${target.fileId}:${target.schemaVersion}:${rowId}:absent`)
    .digest('base64url')}`;
}

/**
 * Return the typed database value result.
 */
function typedDatabaseValue(codec: PostgreSqlColumnCodec, value: unknown): TypedCellValue {
  if (value === null || typeof value === 'undefined') return { type: 'null' };
  if (codec === 'text') return { type: 'text', value: String(value) };
  if (codec === 'integer') return { type: 'integer', value: String(value) };
  if (codec === 'decimal') return { type: 'decimal', value: String(value) };
  if (codec === 'boolean') return { type: 'boolean', value: Boolean(value) };
  if (codec === 'date') return {
    type: 'date',
    value: value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  };
  if (codec === 'time') return { type: 'time', value: String(value) };
  if (codec === 'timestamp') return {
    type: 'timestamp',
    value: value instanceof Date ? value.toISOString() : String(value).replace(' ', 'T')
  };
  return { type: 'json', value: typeof value === 'string' ? value : JSON.stringify(value) };
}

/**
 * Return the database value result.
 */
function databaseValue(value: TypedCellValue): Value {
  if (value.type === 'null') return null;
  return value.value;
}

/**
 * Assert the preconditions.
 */
function assertPreconditions(
  definition: NativeDefinition,
  row: DatabaseRow,
  preconditions: CellPatch[]
) {
  for (const precondition of preconditions) {
    const column = definition.columnsById.get(precondition.columnId);
    const virtual = definition.unstructuredById.get(precondition.columnId);
    if (!column && !virtual) changed();
    const actual = column
      ? typedDatabaseValue(column.codec, row[column.columnName])
      : typedUnstructuredValue(
        definition.jsonColumn
          ? jsonObject(row[definition.jsonColumn.columnName])[precondition.columnId]
          : undefined
      );
    if (JSON.stringify(actual) !== JSON.stringify(precondition.value)) changed();
  }
}

/**
 * Return the ordered patch result.
 */
function orderedPatch(patch: CellPatch[]) {
  return [...patch].sort((left, right) => left.columnId.localeCompare(right.columnId));
}

/**
 * Report the unique columns condition.
 */
function uniqueColumns(columns: NativeColumn[]) {
  return [...new Map(columns.map((column) => [column.columnId, column])).values()];
}

/**
 * Return the stable object result.
 */
function stableObject(snapshot: StableCatalogSnapshot, fileId: string): StableObject | undefined {
  return [...snapshot.objects.values()].find((object) => object.stableId === fileId);
}

/**
 * Return the stable schema result.
 */
function stableSchema(snapshot: StableCatalogSnapshot, schemaId: string): StableSchema | undefined {
  return [...snapshot.schemas.values()].find((schema) => schema.stableId === schemaId);
}

/**
 * Return the native state result.
 */
function nativeState(target: PreparedTarget) {
  return target.state as NativeState;
}

/**
 * Return the unavailable result.
 */
function unavailable(): never {
  throw new ActionFault({
    code: 'not_found',
    message: 'The requested resource is unavailable',
    retryable: false
  });
}

/**
 * Return the changed result.
 */
function changed(): never {
  throw new ActionFault({
    code: 'conflict',
    message: 'The row changed before this action',
    retryable: false
  });
}

/**
 * Return the schema changed result.
 */
function schemaChanged(): never {
  throw new ActionFault({
    code: 'schema_changed',
    message: 'The file schema changed',
    retryable: false,
    issues: [{ code: 'schema_changed', message: 'The file schema changed' }]
  });
}

/**
 * Return the validation rejected result.
 */
function validationRejected(message: string): never {
  throw new ActionFault({
    code: 'validation_failed',
    message: 'The typed values are not valid for this file',
    retryable: false,
    issues: [{ code: 'invalid_row', message }]
  });
}

/**
 * Return the denied result.
 */
function denied(): never {
  throw new ActionFault({
    code: 'capability_denied',
    message: 'The requested capability is denied',
    retryable: false
  });
}
