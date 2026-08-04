import { createHash, randomBytes } from 'node:crypto';
import type { Value } from '@stackpress/inquire/types';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import { quoteIdentifier } from '../../database/helpers/identifiers.js';
import type {
  StableCatalogSnapshot,
  StableColumn,
  StableObject,
  StableSchema
} from '../../catalog/helpers/contracts.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import {
  ActionFault,
  CapabilityResultBudgetExceededError,
  type CapabilityTargetAdapter,
  type CellPatch,
  type PreparedTarget,
  type TargetMutationEffect,
  type TargetMutationRow,
  type TypedCellValue,
  type ValidationIssue
} from './contracts.js';

export type PostgreSqlColumnCodec =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'time'
  | 'timestamp'
  | 'json';

export type PostgreSqlTargetDefinition = {
  fileId: string;
  rowIdentity: {
    kind: 'prefixed-text-versioned-unique-key';
    columnId: string;
    incarnationColumnId: string;
    versionColumnId: string;
  };
  columns: Array<{
    columnId: string;
    codec: PostgreSqlColumnCodec;
  }>;
  insertAuthorityColumnId?: string;
};

export type PostgreSqlBrowseResult = {
  fileId: string;
  schemaVersion: string;
  truncated?: boolean;
  columns: Array<{
    columnId: string;
    codec: PostgreSqlColumnCodec;
    physicalName: string;
    editable: boolean;
    key: boolean;
    generated: boolean;
  }>;
  rows: Array<{
    rowId: string;
    version: string;
    rank?: string;
    cells: CellPatch[];
  }>;
};

type RegisteredColumn = PostgreSqlTargetDefinition['columns'][number];

type RegisteredDefinition = PostgreSqlTargetDefinition & {
  columnsById: Map<string, RegisteredColumn>;
};

type PreparedColumn = RegisteredColumn & {
  columnName: string;
  attributeNumber: number;
  typeName: string;
};

type PreparedDefinition = Omit<RegisteredDefinition, 'columns' | 'columnsById'> & {
  relationOid: string;
  schemaName: string;
  tableName: string;
  qualifiedName: string;
  tableReference: string;
  rowIdColumnName: string;
  rowIdAttributeNumber: number;
  rowIdentityConstraintOid: string;
  rowIdentityIndexOid: string;
  rowIncarnationColumnName: string;
  rowVersionColumnName: string;
  columns: PreparedColumn[];
  columnsById: Map<string, PreparedColumn>;
  insertAuthorityColumnName?: string;
  preparedLiveColumns: LiveColumn[];
};

type TargetState = {
  definition: PreparedDefinition;
};

type LiveColumn = {
  attribute_number: number;
  name: string;
  type_name: string;
  formatted_type: string;
  nullable: boolean;
  identity_kind: string;
  generated_kind: string;
};

type DatabaseRow = Record<string, unknown>;

export class RegisteredPostgreSqlTargetAdapter implements CapabilityTargetAdapter {
  readonly name = 'registered-postgresql-targets';
  readonly #definitions = new Map<string, RegisteredDefinition>();

  register(input: PostgreSqlTargetDefinition) {
    stableId(input.fileId, 'PostgreSQL target file');
    if (this.#definitions.has(input.fileId)) {
      throw new Error(`PostgreSQL target already registered: ${input.fileId}`);
    }
    if (input.rowIdentity.kind !== 'prefixed-text-versioned-unique-key') {
      throw new Error('PostgreSQL target row identity kind is unsupported');
    }
    stableColumnId(input.rowIdentity.columnId, 'PostgreSQL row identity column');
    stableColumnId(
      input.rowIdentity.incarnationColumnId,
      'PostgreSQL row incarnation column'
    );
    stableColumnId(input.rowIdentity.versionColumnId, 'PostgreSQL row version column');
    if (new Set([
      input.rowIdentity.columnId,
      input.rowIdentity.incarnationColumnId,
      input.rowIdentity.versionColumnId
    ]).size !== 3) {
      throw new Error('PostgreSQL row identity control columns must be distinct');
    }
    if (!Array.isArray(input.columns) || !input.columns.length) {
      throw new Error('Registered PostgreSQL targets require at least one editable column');
    }
    const columns = input.columns.map((column) => {
      stableColumnId(column.columnId, 'PostgreSQL target column');
      if (!supportedCodecs.has(column.codec)) {
        throw new Error(`PostgreSQL target codec is unsupported: ${String(column.codec)}`);
      }
      return { ...column };
    });
    if (new Set(columns.map((column) => column.columnId)).size !== columns.length) {
      throw new Error('Registered PostgreSQL target column identities must be unique');
    }
    const rowControlColumns = new Set([
      input.rowIdentity.columnId,
      input.rowIdentity.incarnationColumnId,
      input.rowIdentity.versionColumnId
    ]);
    if (columns.some((column) => rowControlColumns.has(column.columnId))) {
      throw new Error('PostgreSQL row control columns cannot also be editable columns');
    }
    if (input.insertAuthorityColumnId) {
      stableColumnId(input.insertAuthorityColumnId, 'PostgreSQL insert authority column');
      if (
        rowControlColumns.has(input.insertAuthorityColumnId)
        || columns.some((column) => column.columnId === input.insertAuthorityColumnId)
      ) {
        throw new Error('PostgreSQL insert authority column must be a separate stable column');
      }
    }
    this.#definitions.set(input.fileId, {
      ...input,
      columns,
      columnsById: new Map(columns.map((column) => [column.columnId, column]))
    });
  }

  async prepare(database: DatabaseExecutor, fileId: string, connectionId?: string) {
    const registered = this.#definitions.get(fileId);
    if (!registered || !connectionId) return undefined;
    const snapshot = await reconcileCatalog(database, connectionId);
    const object = stableObject(snapshot, fileId);
    if (!object) return undefined;
    if (object.kind !== 'table' && object.kind !== 'partitioned-table') return undefined;
    const schema = stableSchema(snapshot, object.schemaId);
    if (!schema) return undefined;
    const rowIdentity = stableColumn(snapshot, fileId, registered.rowIdentity.columnId);
    const rowIncarnation = stableColumn(
      snapshot,
      fileId,
      registered.rowIdentity.incarnationColumnId
    );
    const rowVersion = stableColumn(snapshot, fileId, registered.rowIdentity.versionColumnId);
    if (!rowIdentity || !rowIncarnation || !rowVersion) return undefined;
    const registeredColumns = registered.columns.map((column) => ({
      registered: column,
      stable: stableColumn(snapshot, fileId, column.columnId)
    }));
    if (registeredColumns.some((column) => !column.stable)) return undefined;
    const authority = registered.insertAuthorityColumnId
      ? stableColumn(snapshot, fileId, registered.insertAuthorityColumnId)
      : undefined;
    if (registered.insertAuthorityColumnId && !authority) return undefined;

    const liveColumns = await readLiveColumns(database, object.relationOid);
    const liveByNumber = new Map(
      liveColumns.map((column) => [column.attribute_number, column])
    );
    const rowLive = liveByNumber.get(rowIdentity.attributeNumber);
    const incarnationLive = liveByNumber.get(rowIncarnation.attributeNumber);
    const versionLive = liveByNumber.get(rowVersion.attributeNumber);
    if (
      !rowLive
      || rowLive.nullable
      || !['text', 'varchar', 'bpchar'].includes(rowLive.type_name)
      || rowLive.generated_kind
      || !incarnationLive
      || incarnationLive.nullable
      || !['uuid', 'text', 'varchar', 'bpchar'].includes(incarnationLive.type_name)
      || incarnationLive.generated_kind
      || !versionLive
      || versionLive.nullable
      || !['int4', 'int8'].includes(versionLive.type_name)
      || versionLive.generated_kind
    ) return undefined;
    const uniqueKeys = await readStableUniqueKeys(
      database,
      object.relationOid,
      rowIdentity.attributeNumber
    );
    const uniqueKey = uniqueKeys[0];
    if (!uniqueKey) return undefined;

    const preparedColumns = registeredColumns.map(({ registered: column, stable }) => {
      const live = liveByNumber.get(stable!.attributeNumber);
      if (!live || !codecMatches(column.codec, live.type_name) || live.generated_kind) {
        schemaChanged();
      }
      return {
        ...column,
        columnName: live.name,
        attributeNumber: stable!.attributeNumber,
        typeName: live.type_name
      };
    });
    const authorityLive = authority ? liveByNumber.get(authority.attributeNumber) : undefined;
    if (authority && (!authorityLive || authorityLive.type_name !== 'name')) schemaChanged();
    const preparedAttributeNumbers = new Set([
      rowIdentity.attributeNumber,
      rowIncarnation.attributeNumber,
      rowVersion.attributeNumber,
      ...preparedColumns.map((column) => column.attributeNumber),
      ...(authority ? [authority.attributeNumber] : [])
    ]);
    const qualifiedName = `${quoteIdentifier(schema.name)}.${quoteIdentifier(object.name)}`;
    const definition: PreparedDefinition = {
      ...registered,
      relationOid: object.relationOid,
      schemaName: schema.name,
      tableName: object.name,
      qualifiedName,
      tableReference: object.kind === 'table' ? `ONLY ${qualifiedName}` : qualifiedName,
      rowIdColumnName: rowLive.name,
      rowIdAttributeNumber: rowIdentity.attributeNumber,
      rowIdentityConstraintOid: uniqueKey.constraint_oid,
      rowIdentityIndexOid: uniqueKey.index_oid,
      rowIncarnationColumnName: incarnationLive.name,
      rowVersionColumnName: versionLive.name,
      columns: preparedColumns,
      columnsById: new Map(preparedColumns.map((column) => [column.columnId, column])),
      preparedLiveColumns: liveColumns.filter((column) =>
        preparedAttributeNumbers.has(column.attribute_number)
      ),
      ...(authorityLive ? { insertAuthorityColumnName: authorityLive.name } : {})
    };
    const schemaVersion = createHash('sha256')
      .update(JSON.stringify([
        snapshot.databaseOid,
        object.relationOid,
        liveColumns,
        registered.rowIdentity,
        registered.columns,
        registered.insertAuthorityColumnId || null
      ]))
      .digest('hex');
    return { fileId, schemaVersion, state: { definition } satisfies TargetState };
  }

  async browse(
    database: DatabaseExecutor,
    target: PreparedTarget,
    limit = 1_000
  ): Promise<PostgreSqlBrowseResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new Error('PostgreSQL grid browse limit is invalid');
    }
    await this.authorize(database, target, 'read');
    const definition = state(target).definition;
    const rowIdentity = quoteIdentifier(definition.rowIdColumnName);
    const result = await database.execute<DatabaseRow>(`
      SELECT ${rowIdentity} AS __tabular_row_identity,
             ${projection(definition, definition.columns)}
        FROM ${definition.tableReference}
       ORDER BY ${rowIdentity}
       LIMIT ${limit}
    `);
    return {
      fileId: target.fileId,
      schemaVersion: target.schemaVersion,
      columns: definition.columns.map((column) => ({
        columnId: column.columnId,
        codec: column.codec,
        physicalName: column.columnName,
        editable: true,
        key: false,
        generated: false
      })),
      rows: result.rows.map((row) => {
        const rowIdentityValue = String(row.__tabular_row_identity);
        return {
          rowId: rowIdentityValue,
          version: versionToken(target, rowIdentityValue, row),
          cells: definition.columns.map((column) => ({
            columnId: column.columnId,
            value: typedDatabaseValue(column.codec, row[column.columnName])
          }))
        };
      })
    };
  }

  async validatePatch(target: PreparedTarget, patch: CellPatch[]): Promise<ValidationIssue[]> {
    const definition = state(target).definition;
    const issues: ValidationIssue[] = [];
    for (const entry of patch) {
      const column = definition.columnsById.get(entry.columnId);
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
      }
    }
    return issues;
  }

  async authorize(
    database: DatabaseExecutor,
    target: PreparedTarget,
    _operation: 'read' | 'mutate'
  ) {
    const definition = state(target).definition;
    await database.execute(`SELECT 1 FROM ${definition.tableReference} WHERE false`);
    const identity = await database.execute<{ relation_oid: string | null }>(`
      SELECT to_regclass(?)::oid::text AS relation_oid
    `, [`${definition.schemaName}.${definition.tableName}`]);
    if (identity.rows[0]?.relation_oid !== definition.relationOid) unavailable();
    const currentLiveColumns = await readLiveColumns(database, definition.relationOid);
    const currentByNumber = new Map(currentLiveColumns.map((column) => [
      column.attribute_number,
      column
    ]));
    const currentPreparedColumns = definition.preparedLiveColumns.map((column) =>
      currentByNumber.get(column.attribute_number)
    );
    if (
      currentPreparedColumns.some((column) => !column)
      || JSON.stringify(currentPreparedColumns) !== JSON.stringify(definition.preparedLiveColumns)
    ) schemaChanged();
    const currentUniqueKeys = await readStableUniqueKeys(
      database,
      definition.relationOid,
      definition.rowIdAttributeNumber
    );
    if (!currentUniqueKeys.some((key) =>
      key.constraint_oid === definition.rowIdentityConstraintOid
      && key.index_oid === definition.rowIdentityIndexOid
    )) schemaChanged();
  }

  async describe(database: DatabaseExecutor, target: PreparedTarget) {
    await this.authorize(database, target, 'read');
    const definition = state(target).definition;
    const privileges = await database.execute<{
      attribute_number: number;
      can_select: boolean;
      can_update: boolean;
    }>(`
      SELECT a.attnum AS attribute_number,
             has_column_privilege(current_user, a.attrelid, a.attnum, 'SELECT') AS can_select,
             has_column_privilege(current_user, a.attrelid, a.attnum, 'UPDATE') AS can_update
        FROM pg_attribute a
       WHERE a.attrelid = ?::oid AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY a.attnum
    `, [definition.relationOid]);
    const byNumber = new Map(privileges.rows.map((row) => [Number(row.attribute_number), row]));
    if ([
      definition.rowIdAttributeNumber,
      definition.preparedLiveColumns.find((column) =>
        column.name === definition.rowIncarnationColumnName
      )?.attribute_number,
      definition.preparedLiveColumns.find((column) =>
        column.name === definition.rowVersionColumnName
      )?.attribute_number
    ].some((number) => !number || !byNumber.get(number)?.can_select)) unavailable();
    const columns = definition.columns
      .filter((column) => byNumber.get(column.attributeNumber)?.can_select)
      .map((column) => ({
        columnId: column.columnId,
        codec: column.codec,
        editable: Boolean(byNumber.get(column.attributeNumber)?.can_update),
        key: false,
        generated: false
      }));
    if (!columns.length) unavailable();
    const tablePrivileges = await database.execute<{
      can_select: boolean;
      can_insert: boolean;
      can_delete: boolean;
    }>(`
      SELECT has_table_privilege(current_user, ?::oid, 'SELECT') AS can_select,
             has_table_privilege(current_user, ?::oid, 'INSERT') AS can_insert,
             has_table_privilege(current_user, ?::oid, 'DELETE') AS can_delete
    `, [definition.relationOid, definition.relationOid, definition.relationOid]);
    return {
      fileId: target.fileId,
      schemaVersion: target.schemaVersion,
      columns,
      operations: {
        update: columns.some((column) => column.editable),
        insert: Boolean(tablePrivileges.rows[0]?.can_select
          && tablePrivileges.rows[0]?.can_insert),
        delete: Boolean(tablePrivileges.rows[0]?.can_select
          && tablePrivileges.rows[0]?.can_delete)
      }
    };
  }

  async read(
    database: DatabaseExecutor,
    target: PreparedTarget,
    rowId: string,
    columnIds: string[],
    maximumResultBytes?: number
  ) {
    const definition = state(target).definition;
    const selected = columnIds.map((columnId) => definition.columnsById.get(columnId));
    if (selected.some((column) => !column)) return undefined;
    const query = `
      SELECT ${projection(definition, selected as PreparedColumn[])}
        FROM ${definition.tableReference}
       WHERE ${quoteIdentifier(definition.rowIdColumnName)} = ?
    `;
    await assertBoundedRead(database, query, [rowId], maximumResultBytes);
    const result = await database.execute<DatabaseRow>(query, [rowId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      rowId,
      version: versionToken(target, rowId, row),
      cells: (selected as PreparedColumn[]).map((column) => ({
        columnId: column.columnId,
        value: typedDatabaseValue(column.codec, row[column.columnName])
      }))
    };
  }

  async mutate(
    database: DatabaseExecutor,
    target: PreparedTarget,
    rows: TargetMutationRow[]
  ): Promise<TargetMutationEffect> {
    const effect: TargetMutationEffect = { rows: [], changes: [] };
    for (const requested of [...rows].sort((left, right) =>
      (left.rowId || '').localeCompare(right.rowId || '')
    )) {
      const operation = requested.operation || (requested.rowId ? 'update' : 'insert');
      if (operation === 'insert') {
        await this.insert(database, target, requested, effect);
      } else if (operation === 'delete') {
        await this.delete(database, target, requested, effect);
      } else {
        await this.update(database, target, requested, effect);
      }
    }
    return effect;
  }

  private async update(
    database: DatabaseExecutor,
    target: PreparedTarget,
    requested: TargetMutationRow,
    effect: TargetMutationEffect
  ) {
    const definition = state(target).definition;
    const ordered = orderedPatch(requested.patch);
    const needed = uniqueColumns(definition, [
      ...ordered.map((entry) => entry.columnId),
      ...(requested.preconditions || []).map((entry) => entry.columnId)
    ]);
    const current = await this.lockRow(database, definition, requested.rowId!, needed);
    if (!current) unavailable();
    const priorVersion = versionToken(target, requested.rowId!, current);
    if (
      requested.expectedVersion
      && !requested.expectedIncarnation
      && requested.expectedVersion !== priorVersion
    ) changed();
    const incarnation = incarnationToken(target, requested.rowId!, current);
    if (requested.expectedIncarnation && requested.expectedIncarnation !== incarnation) changed();
    assertPreconditions(definition, current, requested.preconditions || []);
    const assignments = ordered.map((entry) =>
      `${quoteIdentifier(definition.columnsById.get(entry.columnId)!.columnName)} = ?`
    );
    const updated = await database.execute<DatabaseRow>(`
      UPDATE ${definition.tableReference}
         SET ${assignments.join(', ')}
       WHERE ${quoteIdentifier(definition.rowIdColumnName)} = ?
       RETURNING ${projection(
        definition,
        uniqueColumns(definition, ordered.map((entry) => entry.columnId))
      )}
    `, [...ordered.map((entry) => databaseValue(entry.value)), requested.rowId!]);
    if (updated.affectedRows !== 1 || updated.rows.length !== 1) changed();
    const next = updated.rows[0]!;
    assertAdvancedRowControls(definition, current, next);
    effect.rows.push({
      rowId: requested.rowId!,
      operation: 'update',
      priorVersion,
      resultingVersion: versionToken(target, requested.rowId!, next),
      incarnation
    });
    for (const entry of ordered) {
      const column = definition.columnsById.get(entry.columnId)!;
      effect.changes.push({
        rowId: requested.rowId!,
        columnId: entry.columnId,
        before: typedDatabaseValue(column.codec, current[column.columnName]),
        after: typedDatabaseValue(column.codec, next[column.columnName])
      });
    }
  }

  private async insert(
    database: DatabaseExecutor,
    target: PreparedTarget,
    requested: TargetMutationRow,
    effect: TargetMutationEffect
  ) {
    const definition = state(target).definition;
    const rowId = requested.rowId || `row_${randomBytes(18).toString('base64url')}`;
    if (requested.rowId && await this.lockRow(database, definition, requested.rowId, [])) changed();
    const ordered = orderedPatch(requested.patch);
    if (!ordered.length) validationRejected('A promoted row requires at least one typed value');
    const columns = ordered.map((entry) => definition.columnsById.get(entry.columnId)!);
    const names = columns.map((column) => quoteIdentifier(column.columnName));
    const authorityName = definition.insertAuthorityColumnName;
    const insertNames = [
      quoteIdentifier(definition.rowIdColumnName),
      ...(authorityName ? [quoteIdentifier(authorityName)] : []),
      ...names
    ];
    const expressions = ['?', ...(authorityName ? ['current_user'] : []), ...ordered.map(() => '?')];
    const inserted = await database.execute<DatabaseRow>(`
      INSERT INTO ${definition.qualifiedName} (${insertNames.join(', ')})
      VALUES (${expressions.join(', ')})
      RETURNING ${projection(definition, columns)}
    `, [rowId, ...ordered.map((entry) => databaseValue(entry.value))]);
    if (inserted.affectedRows !== 1 || inserted.rows.length !== 1) changed();
    const next = inserted.rows[0]!;
    assertInitialRowControls(definition, next);
    effect.rows.push({
      rowId,
      operation: 'insert',
      priorVersion: tombstoneVersion(target, rowId),
      resultingVersion: versionToken(target, rowId, next),
      incarnation: incarnationToken(target, rowId, next)
    });
    for (const entry of ordered) {
      const column = definition.columnsById.get(entry.columnId)!;
      effect.changes.push({
        rowId,
        columnId: entry.columnId,
        before: { type: 'null' },
        after: typedDatabaseValue(column.codec, next[column.columnName])
      });
    }
  }

  private async delete(
    database: DatabaseExecutor,
    target: PreparedTarget,
    requested: TargetMutationRow,
    effect: TargetMutationEffect
  ) {
    const definition = state(target).definition;
    // A direct delete must capture every registered value so undo can restore
    // the row exactly. A reversal already carries the bounded values it must
    // compare and does not gain authority to read unrelated columns.
    const needed = requested.preconditions?.length
      ? uniqueColumns(definition, requested.preconditions.map((entry) => entry.columnId))
      : definition.columns;
    const current = await this.lockRow(database, definition, requested.rowId!, needed);
    if (!current) unavailable();
    const priorVersion = versionToken(target, requested.rowId!, current);
    if (requested.expectedVersion && requested.expectedVersion !== priorVersion) changed();
    const incarnation = incarnationToken(target, requested.rowId!, current);
    if (requested.expectedIncarnation && requested.expectedIncarnation !== incarnation) changed();
    assertPreconditions(definition, current, requested.preconditions || []);
    const deleted = await database.execute(`
      DELETE FROM ${definition.tableReference}
       WHERE ${quoteIdentifier(definition.rowIdColumnName)} = ?
    `, [requested.rowId!]);
    if (deleted.affectedRows !== 1) changed();
    effect.rows.push({
      rowId: requested.rowId!,
      operation: 'delete',
      priorVersion,
      resultingVersion: tombstoneVersion(target, requested.rowId!),
      incarnation
    });
    for (const column of needed) {
      effect.changes.push({
        rowId: requested.rowId!,
        columnId: column.columnId,
        before: typedDatabaseValue(column.codec, current[column.columnName]),
        after: { type: 'null' }
      });
    }
  }

  private async lockRow(
    database: DatabaseExecutor,
    definition: PreparedDefinition,
    rowId: string,
    columns: PreparedColumn[]
  ) {
    const result = await database.execute<DatabaseRow>(`
      SELECT ${projection(definition, columns)}
        FROM ${definition.tableReference}
       WHERE ${quoteIdentifier(definition.rowIdColumnName)} = ?
       FOR UPDATE
    `, [rowId]);
    if (result.rows.length > 1) changed();
    return result.rows[0];
  }
}

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
  const measured = await database.execute<{ bytes: string }>(`
    SELECT COALESCE(sum(octet_length(row_to_json(bounded_row)::text) + 1), 0)::text AS bytes
      FROM (${query}) AS bounded_row
  `, values);
  if (BigInt(measured.rows[0]?.bytes || '0') > BigInt(maximumResultBytes)) {
    throw new CapabilityResultBudgetExceededError();
  }
}

const supportedCodecs = new Set<PostgreSqlColumnCodec>([
  'text', 'integer', 'decimal', 'boolean', 'date', 'time', 'timestamp', 'json'
]);

function stableId(value: string, label: string) {
  if (!/^obj_[A-Za-z0-9_-]{32,64}$/.test(value)) throw new Error(`${label} identity is invalid`);
}

function stableColumnId(value: string, label: string) {
  if (!/^col_[A-Za-z0-9_-]{32,64}$/.test(value)) throw new Error(`${label} identity is invalid`);
}

function stableObject(snapshot: StableCatalogSnapshot, fileId: string): StableObject | undefined {
  return [...snapshot.objects.values()].find((object) => object.stableId === fileId);
}

function stableSchema(snapshot: StableCatalogSnapshot, schemaId: string): StableSchema | undefined {
  return [...snapshot.schemas.values()].find((schema) => schema.stableId === schemaId);
}

function stableColumn(
  snapshot: StableCatalogSnapshot,
  fileId: string,
  columnId: string
): StableColumn | undefined {
  return [...snapshot.columns.values()].find((column) =>
    column.objectId === fileId && column.stableId === columnId
  );
}

function codecMatches(codec: PostgreSqlColumnCodec, typeName: string) {
  if (codec === 'text') return ['text', 'varchar', 'bpchar'].includes(typeName);
  if (codec === 'integer') return ['int2', 'int4', 'int8'].includes(typeName);
  if (codec === 'decimal') return typeName === 'numeric';
  if (codec === 'boolean') return typeName === 'bool';
  if (codec === 'date') return typeName === 'date';
  if (codec === 'time') return typeName === 'time';
  if (codec === 'timestamp') return ['timestamp', 'timestamptz'].includes(typeName);
  return ['json', 'jsonb'].includes(typeName);
}

function state(target: PreparedTarget) {
  return target.state as TargetState;
}

function orderedPatch(patch: CellPatch[]) {
  return [...patch].sort((left, right) => left.columnId.localeCompare(right.columnId));
}

function uniqueColumns(definition: PreparedDefinition, columnIds: string[]) {
  return [...new Set(columnIds)]
    .sort()
    .map((columnId) => definition.columnsById.get(columnId)!)
    .filter(Boolean);
}

function projection(definition: PreparedDefinition, columns: PreparedColumn[]) {
  return [
    quoteIdentifier(definition.rowIncarnationColumnName),
    quoteIdentifier(definition.rowVersionColumnName),
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

async function readLiveColumns(database: DatabaseExecutor, relationOid: string) {
  const result = await database.execute<LiveColumn>(`
    SELECT a.attnum AS attribute_number, a.attname AS name,
           t.typname AS type_name, format_type(a.atttypid, a.atttypmod) AS formatted_type,
           NOT a.attnotnull AS nullable, a.attidentity AS identity_kind,
           a.attgenerated AS generated_kind
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
     WHERE a.attrelid = ?::oid
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum
  `, [relationOid]);
  return result.rows.map((column) => ({
    ...column,
    attribute_number: Number(column.attribute_number)
  }));
}

async function readStableUniqueKeys(
  database: DatabaseExecutor,
  relationOid: string,
  rowIdentityAttributeNumber: number
) {
  const result = await database.execute<{ constraint_oid: string; index_oid: string }>(`
    SELECT c.oid::text AS constraint_oid, i.indexrelid::text AS index_oid
      FROM pg_constraint c
      JOIN pg_index i
        ON i.indrelid = c.conrelid AND i.indexrelid = c.conindid
     WHERE c.conrelid = ?::oid
       AND c.contype IN ('p', 'u')
       AND c.convalidated AND NOT c.condeferrable
       AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
       AND i.indpred IS NULL AND i.indexprs IS NULL
       AND i.indnkeyatts = 1
       AND i.indkey[0] = ?::smallint
     ORDER BY c.oid
  `, [relationOid, rowIdentityAttributeNumber]);
  return result.rows;
}

function assertPreconditions(
  definition: PreparedDefinition,
  row: DatabaseRow,
  preconditions: CellPatch[]
) {
  for (const precondition of preconditions) {
    const column = definition.columnsById.get(precondition.columnId)!;
    const actual = typedDatabaseValue(column.codec, row[column.columnName]);
    if (JSON.stringify(actual) !== JSON.stringify(precondition.value)) changed();
  }
}

function assertAdvancedRowControls(
  definition: PreparedDefinition,
  before: DatabaseRow,
  after: DatabaseRow
) {
  const beforeIncarnation = before[definition.rowIncarnationColumnName];
  const afterIncarnation = after[definition.rowIncarnationColumnName];
  const beforeVersion = BigInt(String(before[definition.rowVersionColumnName]));
  const afterVersion = BigInt(String(after[definition.rowVersionColumnName]));
  if (beforeIncarnation !== afterIncarnation || afterVersion <= beforeVersion) {
    throw new Error('PostgreSQL row version controls did not advance safely');
  }
}

function assertInitialRowControls(definition: PreparedDefinition, row: DatabaseRow) {
  const incarnation = row[definition.rowIncarnationColumnName];
  const version = BigInt(String(row[definition.rowVersionColumnName]));
  if (typeof incarnation !== 'string' || !incarnation || version < 1n) {
    throw new Error('PostgreSQL row version controls were not initialized');
  }
}

function typedDatabaseValue(codec: PostgreSqlColumnCodec, value: unknown): TypedCellValue {
  if (value === null || typeof value === 'undefined') return { type: 'null' };
  if (codec === 'text') return { type: 'text', value: String(value) };
  if (codec === 'integer') return { type: 'integer', value: String(value) };
  if (codec === 'decimal') return { type: 'decimal', value: String(value) };
  if (codec === 'boolean') return { type: 'boolean', value: Boolean(value) };
  if (codec === 'date') {
    const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    return { type: 'date', value: date };
  }
  if (codec === 'time') return { type: 'time', value: String(value) };
  if (codec === 'timestamp') {
    return {
      type: 'timestamp',
      value: value instanceof Date ? value.toISOString() : String(value).replace(' ', 'T')
    };
  }
  return { type: 'json', value: typeof value === 'string' ? value : JSON.stringify(value) };
}

function databaseValue(value: TypedCellValue): Value {
  if (value.type === 'null') return null;
  return value.value;
}

function versionToken(target: PreparedTarget, rowId: string, row: DatabaseRow) {
  const definition = state(target).definition;
  const incarnation = row[definition.rowIncarnationColumnName];
  const version = row[definition.rowVersionColumnName];
  if (
    typeof incarnation !== 'string'
    || !incarnation
    || !/^[0-9]+$/.test(String(version))
  ) {
    throw new Error('PostgreSQL row version controls were unavailable');
  }
  return `ver_${createHash('sha256')
    .update(JSON.stringify([
      target.fileId,
      target.schemaVersion,
      rowId,
      incarnation,
      String(version)
    ]))
    .digest('base64url')}`;
}

function incarnationToken(target: PreparedTarget, rowId: string, row: DatabaseRow) {
  const definition = state(target).definition;
  const incarnation = row[definition.rowIncarnationColumnName];
  if (typeof incarnation !== 'string' || !incarnation) {
    throw new Error('PostgreSQL row incarnation control was unavailable');
  }
  return `inc_${createHash('sha256')
    .update(JSON.stringify([target.fileId, target.schemaVersion, rowId, incarnation]))
    .digest('base64url')}`;
}

function tombstoneVersion(target: PreparedTarget, rowId: string) {
  return `ver_${createHash('sha256')
    .update(`${target.fileId}:${target.schemaVersion}:${rowId}:absent`)
    .digest('base64url')}`;
}

function unavailable(): never {
  throw new ActionFault({
    code: 'not_found',
    message: 'The requested resource is unavailable',
    retryable: false
  });
}

function changed(): never {
  throw new ActionFault({
    code: 'conflict',
    message: 'The row changed before this action',
    retryable: false
  });
}

function schemaChanged(): never {
  throw new ActionFault({
    code: 'schema_changed',
    message: 'The file schema changed',
    retryable: false,
    issues: [{ code: 'schema_changed', message: 'The file schema changed' }]
  });
}

function validationRejected(message: string): never {
  throw new ActionFault({
    code: 'validation_failed',
    message: 'The typed values are not valid for this file',
    retryable: false,
    issues: [{ code: 'empty_row', message }]
  });
}
