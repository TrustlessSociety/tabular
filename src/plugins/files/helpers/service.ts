//client
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { StableCatalogSnapshot, StableObject } from '../../catalog/helpers/contracts.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { OperationsPluginService } from '../../operations/helpers/service.js';
import type {
  FileDescription,
  FileDdlAction,
  FileDdlStatus,
  FileFieldKind,
  FileFormatKind
} from './contracts.js';
import type { NativeDdlFailpoint } from './executor.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import {
  isBrowserMutationPrincipal
} from '../../identity/helpers/contracts.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import {
  catalogAuthorizedTransactions,
  withCatalogReconciliationRetry
} from '../../catalog/helpers/service.js';
import { opaqueId } from '../../identity/helpers/security.js';
import { FileDdlWorkflow } from '../events/ddl-workflow.js';
import { FileRepository, iso } from './repository.js';
import { validateUnstructuredColumn } from './validation.js';

//The files service value exported for module callers
export const FILES_SERVICE = 'tabular.files';

//The file folder permissions contract exported for module callers
export type FileFolderPermissions = {
  createFile: boolean,
  importFile: boolean,
  renameFile: boolean,
  configureFile: boolean,
};

type NativeFile = {
  relation_oid: string | number,
  schema_name: string,
  relation_name: string,
  relkind: string,
  can_read: boolean,
  has_row_identity: boolean,
};

type NativeColumn = {
  attribute_number: number,
  physical_name: string,
  storage_type: string,
  nullable: boolean,
  default_expression: string | null,
  generated_expression: string | null,
  identity_kind: string,
  generated_kind: string,
  can_read: boolean,
  can_update: boolean,
};

type NativeConstraint = {
  oid: string | number,
  physical_name: string,
  kind: string,
  source_numbers: string | null,
  target_relation_oid: string | number,
  target_numbers: string | null,
  definition: string,
  target_visible: boolean,
};

type ColumnMetadata = {
  column_id: string,
  catalog_column_id: string | null,
  storage_kind: 'postgresql' | 'unstructured-json',
  display_name: string,
  field_kind: string,
  format_kind: string,
  field_config: Record<string, unknown>,
  format_config: Record<string, unknown>,
  hidden: boolean,
  hidden_purpose: string | null,
};

/**
 * Provide files plugin operations through one service boundary.
 */
export class FilesPluginService {
  //The name state retained by this class instance
  public readonly name = FILES_SERVICE;
  //The workflow state retained by this class instance
  readonly #workflow: FileDdlWorkflow;

  /**
   * Create a FilesPluginService instance.
   */
  public constructor(
    runtime: ApplicationRuntimeService,
    database: DatabasePluginService,
    private readonly identity: IdentityPluginService,
    operations: OperationsPluginService
  ) {
    this.#workflow = new FileDdlWorkflow(
      runtime.processKind,
      database,
      identity,
      operations,
      Boolean(runtime.developmentDatabase)
    );
  }

  /**
   * Handle the plan operation.
   */
  public plan(principal: BrowserMutationPrincipal, action: FileDdlAction) {
    return catalogAuthorizedTransactions.run(() => withCatalogReconciliationRetry(
      () => this.#workflow.plan(principal, action)
    ));
  }

  /**
   * Handle the confirm operation.
   */
  public confirm(
    principal: BrowserMutationPrincipal,
    requestId: string,
    confirmationToken: string
  ) {
    return this.#workflow.confirm(principal, requestId, confirmationToken);
  }

  /**
   * Apply the confirmed.
   */
  public applyConfirmed(
    requestId: string,
    options: { failpoint?: NativeDdlFailpoint, } = {}
  ) {
    return this.#workflow.apply(requestId, options);
  }

  /**
   * Handle the status operation.
   */
  public status(principal: BrowserPrincipal, requestId: string): Promise<FileDdlStatus> {
    let request: Awaited<ReturnType<FileRepository['ownedRequest']>>;
    let operation: Awaited<ReturnType<FileRepository['ownedApplyOperation']>>;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.files',
      async () => {
        if (!request) {
          throw new ApplicationError(
            'file_ddl_unavailable',
            404,
            'The schema-change request is unavailable'
          );
        }
        const error = operation?.error_summary;
        return {
          requestId: request.id,
          state: request.state,
          actionType: request.action_type,
          expiresAt: iso(request.expires_at),
          ...(request.state === 'applied' && request.result_summary
            ? { result: request.result_summary }
            : {}),
          ...(operation ? {
            operation: {
              state: operation.state,
              ...(error && typeof error.code === 'string' && typeof error.message === 'string'
                ? {
                  error: {
                    code: error.code,
                    message: error.message,
                    retryable: error.retryable === true
                  }
                }
                : {})
            }
          } : {})
        };
      },
      async (database) => {
        const repository = new FileRepository(database);
        request = await repository.ownedRequest(principal, requestId);
        operation = await repository.ownedApplyOperation(principal, requestId);
      },
      undefined,
      'read committed'
    );
  }

  /**
   * Handle the display names operation.
   */
  public displayNames(principal: BrowserPrincipal, fileIds: string[]) {
    const ids = [...new Set(fileIds)];
    if (!ids.length) return Promise.resolve(new Map<string, string>());
    let rows: Array<{ object_id: string, display_name: string, relation_oid: string, }> = [];
    return this.identity.authorizedTransaction(
      principal,
      'tabular.files',
      async (database) => {
        if (!rows.length) return new Map<string, string>();
        const visibility = await database.execute<{ relation_oid: string, }>(`
          SELECT c.oid::text AS relation_oid
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.oid IN (${rows.map(() => '?::oid').join(', ')})
             AND has_schema_privilege(current_user, n.oid, 'USAGE')
             AND (
               has_table_privilege(current_user, c.oid, 'SELECT')
               OR has_any_column_privilege(current_user, c.oid, 'SELECT')
             )
        `, rows.map((row) => row.relation_oid));
        const visible = new Set(visibility.rows.map((row) => String(row.relation_oid)));
        return new Map(rows
          .filter((row) => visible.has(String(row.relation_oid)))
          .map((row) => [row.object_id, row.display_name]));
      },
      async (database) => {
        const result = await database.execute<{
          object_id: string,
          display_name: string,
          relation_oid: string | number,
        }>(`
          SELECT metadata.object_id, metadata.display_name, object.relation_oid
            FROM tabular.file_metadata metadata
            JOIN tabular.catalog_objects object ON object.id = metadata.object_id
           WHERE metadata.object_id IN (${ids.map(() => '?').join(', ')})
        `, ids);
        rows = result.rows.map((row) => ({ ...row, relation_oid: String(row.relation_oid) }));
      },
      undefined,
      'read committed'
    );
  }

  /**
   * Create the unstructured column.
   */
  public async createUnstructuredColumn(
    principal: BrowserMutationPrincipal,
    input: {
      fileId: string,
      displayName: string,
      field: FileFieldKind,
      format: FileFormatKind,
      fieldConfig?: Record<string, unknown>,
      formatConfig?: Record<string, unknown>,
    }
  ) {
    requireMutation(principal);
    input = validateUnstructuredColumn(input);
    return catalogAuthorizedTransactions.run(() => withCatalogReconciliationRetry(async () => {
      const columnId = opaqueId('col');
      let stable: StableCatalogSnapshot | undefined;
      let object: StableObject | undefined;
      let hiddenAttributeNumber: number | undefined;
      return this.identity.authorizedTransaction(
      principal,
      'tabular.files',
      async (database) => {
        if (!object) unavailable();
        if (!hiddenAttributeNumber) unavailable();
        const allowed = await database.execute<{ allowed: boolean, }>(`
          SELECT has_column_privilege(
            current_user, ?::oid, ?::smallint, 'UPDATE'
          ) AS allowed
        `, [object.relationOid, hiddenAttributeNumber]);
        if (!allowed.rows[0]?.allowed) denied();
        return { id: columnId, fileId: object.stableId };
      },
      async (database) => {
        stable = await reconcileCatalog(database, principal.connectionId);
        object = findObject(stable, input.fileId);
        if (!object || !['table', 'partitioned-table'].includes(object.kind)) unavailable();
        const hidden = await database.execute<{
          attribute_number: string | number,
          valid: boolean,
        }>(`
          SELECT a.attnum AS attribute_number,
                 o.relation_oid = ?::oid
                   AND o.state = 'current'
                   AND c.state = 'current'
                   AND a.attname = c.observed_name
                   AND a.atttypid = 'jsonb'::regtype
                   AND a.attnotnull
                   AND a.attidentity = ''
                   AND a.attgenerated = ''
                   AND pg_get_expr(d.adbin, d.adrelid) = '''{}''::jsonb'
                   AS valid
            FROM tabular.column_metadata m
            JOIN tabular.catalog_objects o ON o.id = m.object_id
            JOIN tabular.catalog_columns c ON c.id = m.catalog_column_id
            JOIN pg_attribute a
              ON a.attrelid = o.relation_oid AND a.attnum = c.attribute_number
             AND a.attnum > 0 AND NOT a.attisdropped
            LEFT JOIN pg_attrdef d
              ON d.adrelid = a.attrelid AND d.adnum = a.attnum
           WHERE m.object_id = ? AND m.hidden
             AND m.hidden_purpose = 'unstructured-json'
             AND m.storage_kind = 'postgresql'
        `, [object.relationOid, object.stableId]);
        if (!hidden.rows[0]) {
          throw new ApplicationError(
            'file_ddl_unavailable',
            409,
            'The owner must install the unstructured JSON field first'
          );
        }
        if (!hidden.rows[0].valid) {
          throw new ApplicationError(
            'file_ddl_stale',
            409,
            'The Tabular-owned unstructured JSON field has PostgreSQL drift'
          );
        }
        hiddenAttributeNumber = Number(hidden.rows[0].attribute_number);
      },
      async (database, result) => {
        await database.execute(`
          INSERT INTO tabular.column_metadata (
            column_id, object_id, catalog_column_id, storage_kind,
            display_name, field_kind, format_kind, field_config, format_config, hidden
          ) VALUES (?, ?, NULL, 'unstructured-json', ?, ?, ?, ?::jsonb, ?::jsonb, false)
        `, [
          columnId,
          result.fileId,
          input.displayName,
          input.field,
          input.format,
          JSON.stringify(input.fieldConfig || {}),
          JSON.stringify(input.formatConfig || {})
        ]);
        await database.execute(`
          UPDATE tabular.file_metadata
             SET metadata_version = metadata_version + 1, updated_at = clock_timestamp()
           WHERE object_id = ?
        `, [result.fileId]);
        return result;
      },
        'read committed'
      );
    }));
  }

  /**
   * Describe the current value.
   */
  public async describe(principal: BrowserPrincipal, fileId: string): Promise<FileDescription> {
    return catalogAuthorizedTransactions.run(() => withCatalogReconciliationRetry(async () => {
      let stable: StableCatalogSnapshot | undefined;
      let object: StableObject | undefined;
      let displayName: string | undefined;
      let metadata: ColumnMetadata[] = [];
      let targetAliases = new Map<string, string>();
      return this.identity.authorizedTransaction(
      principal,
      'tabular.files',
      async (database) => {
        if (!stable || !object) unavailable();
        const native = await readNativeFile(database, object);
        if (!native.can_read) denied();
        const columns = await readNativeColumns(database, object.relationOid);
        const constraints = await readNativeConstraints(database, object.relationOid);
        return mergeDescription(
          stable,
          object,
          displayName || object.name,
          native,
          columns,
          constraints,
          metadata,
          targetAliases
        );
      },
      async (database) => {
        stable = await reconcileCatalog(database, principal.connectionId);
        object = findObject(stable, fileId);
        if (!object) unavailable();
        const file = await database.execute<{ display_name: string, }>(`
          SELECT display_name FROM tabular.file_metadata WHERE object_id = ?
        `, [object.stableId]);
        displayName = file.rows[0]?.display_name;
        const fields = await database.execute<ColumnMetadata>(`
          SELECT column_id, catalog_column_id, storage_kind, display_name,
                 field_kind, format_kind, field_config, format_config,
                 hidden, hidden_purpose
            FROM tabular.column_metadata
           WHERE object_id = ?
           ORDER BY created_at, column_id
        `, [object.stableId]);
        metadata = fields.rows;
        const aliases = await database.execute<{
          catalog_column_id: string,
          column_id: string,
        }>(`
          SELECT catalog_column_id, column_id
            FROM tabular.column_metadata
           WHERE catalog_column_id IS NOT NULL
        `);
        targetAliases = new Map(
          aliases.rows.map((row) => [row.catalog_column_id, row.column_id])
        );
      },
      undefined,
        'read committed'
      );
    }));
  }

  /**
   * Handle the folder permissions operation.
   */
  public async folderPermissions(
    principal: BrowserPrincipal
  ): Promise<Map<string, FileFolderPermissions>> {
    return catalogAuthorizedTransactions.run(() => withCatalogReconciliationRetry(async () => {
      let stable: StableCatalogSnapshot | undefined;
      return this.identity.authorizedTransaction(
      principal,
      'tabular.files',
      async (database) => {
        if (!stable) throw new Error('Stable catalog reconciliation did not run');
        const permissions = new Map<string, FileFolderPermissions>();
        for (const schema of stable.schemas.values()) {
          const result = await database.execute<{
            create_allowed: boolean,
            manage_allowed: boolean,
          }>(`
            SELECT has_schema_privilege(current_user, ?::oid, 'CREATE') AS create_allowed,
                   EXISTS (
                     SELECT 1 FROM pg_class c
                      WHERE c.relnamespace = ?::oid
                        AND c.relkind IN ('r', 'p')
                        AND pg_has_role(current_user, c.relowner, 'USAGE')
                   ) AS manage_allowed
          `, [schema.namespaceOid, schema.namespaceOid]);
          const row = result.rows[0];
          permissions.set(schema.stableId, {
            createFile: Boolean(row?.create_allowed),
            importFile: Boolean(row?.create_allowed),
            renameFile: Boolean(row?.manage_allowed),
            configureFile: Boolean(row?.manage_allowed)
          });
        }
        return permissions;
      },
      async (database) => {
        stable = await reconcileCatalog(database, principal.connectionId);
      },
      undefined,
        'read committed'
      );
    }));
  }
}

/**
 * Read the native file.
 */
async function readNativeFile(database: DatabaseExecutor, object: StableObject) {
  const result = await database.execute<NativeFile>(`
    SELECT c.oid AS relation_oid, n.nspname AS schema_name,
           c.relname AS relation_name, c.relkind,
           (has_schema_privilege(current_user, n.oid, 'USAGE') AND (
             has_table_privilege(current_user, c.oid, 'SELECT') OR EXISTS (
             SELECT 1 FROM pg_attribute visible
              WHERE visible.attrelid = c.oid AND visible.attnum > 0
                AND NOT visible.attisdropped
                AND has_column_privilege(current_user, c.oid, visible.attnum, 'SELECT')
           ))) AS can_read,
           EXISTS (
             SELECT 1
               FROM pg_constraint identity_constraint
               JOIN pg_index identity_index
                 ON identity_index.indrelid = identity_constraint.conrelid
                AND identity_index.indexrelid = identity_constraint.conindid
              WHERE identity_constraint.conrelid = c.oid
                AND identity_constraint.contype IN ('p', 'u')
                AND identity_constraint.convalidated
                AND NOT identity_constraint.condeferrable
                AND identity_index.indisunique AND identity_index.indisvalid
                AND identity_index.indisready AND identity_index.indimmediate
                AND identity_index.indpred IS NULL AND identity_index.indexprs IS NULL
                AND identity_constraint.conkey IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1
                    FROM unnest(identity_constraint.conkey) AS key_column(attribute_number)
                    JOIN pg_attribute key_attribute
                      ON key_attribute.attrelid = c.oid
                     AND key_attribute.attnum = key_column.attribute_number
                   WHERE NOT key_attribute.attnotnull
                      OR NOT has_column_privilege(
                        current_user,
                        c.oid,
                        key_column.attribute_number,
                        'SELECT'
                      )
                )
           ) AS has_row_identity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.oid = ?::oid AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  `, [object.relationOid]);
  const row = result.rows[0];
  if (!row || row.relation_name !== object.name) unavailable();
  return row;
}

/**
 * Read the native columns.
 */
async function readNativeColumns(database: DatabaseExecutor, relationOid: string) {
  return (await database.execute<NativeColumn>(`
    SELECT a.attnum AS attribute_number, a.attname AS physical_name,
           format_type(a.atttypid, a.atttypmod) AS storage_type,
           NOT a.attnotnull AS nullable,
           CASE WHEN d.oid IS NULL THEN NULL ELSE pg_get_expr(d.adbin, d.adrelid) END AS default_expression,
           CASE WHEN a.attgenerated = '' THEN NULL ELSE pg_get_expr(d.adbin, d.adrelid) END AS generated_expression,
           a.attidentity AS identity_kind, a.attgenerated AS generated_kind,
           has_column_privilege(current_user, a.attrelid, a.attnum, 'SELECT') AS can_read,
           has_column_privilege(current_user, a.attrelid, a.attnum, 'UPDATE') AS can_update
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = ?::oid AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum
  `, [relationOid])).rows;
}

/**
 * Read the native constraints.
 */
async function readNativeConstraints(database: DatabaseExecutor, relationOid: string) {
  return (await database.execute<NativeConstraint>(`
    SELECT c.oid, c.conname AS physical_name, c.contype AS kind,
           c.conkey::text AS source_numbers, c.confrelid AS target_relation_oid,
           c.confkey::text AS target_numbers,
           pg_get_constraintdef(c.oid, false) AS definition,
           CASE WHEN c.contype <> 'f' THEN true ELSE EXISTS (
             SELECT 1
               FROM pg_class target
              WHERE target.oid = c.confrelid
                AND has_schema_privilege(current_user, target.relnamespace, 'USAGE')
                AND NOT EXISTS (
                  SELECT 1 FROM unnest(c.confkey) AS target_key(attribute_number)
                   WHERE NOT has_column_privilege(
                     current_user,
                     c.confrelid,
                     target_key.attribute_number,
                     'SELECT'
                   )
                )
           )
           END AS target_visible
      FROM pg_constraint c
     WHERE c.conrelid = ?::oid
     ORDER BY c.oid
  `, [relationOid])).rows;
}

/**
 * Merge the description.
 */
function mergeDescription(
  stable: StableCatalogSnapshot,
  object: StableObject,
  displayName: string,
  native: NativeFile,
  columns: NativeColumn[],
  constraints: NativeConstraint[],
  metadata: ColumnMetadata[],
  targetAliases: Map<string, string>
): FileDescription {
  const stableColumns = [...stable.columns.values()].filter((item) => item.objectId === object.stableId);
  const stableByNumber = new Map(stableColumns.map((item) => [item.attributeNumber, item]));
  const metadataByCatalog = new Map(
    metadata.filter((item) => item.catalog_column_id).map((item) => [item.catalog_column_id!, item])
  );
  const visibleNative = columns.flatMap((item) => {
    if (!item.can_read) return [];
    const catalog = stableByNumber.get(Number(item.attribute_number));
    if (!catalog) return [];
    const presentation = metadataByCatalog.get(catalog.stableId);
    if (presentation?.hidden) return [];
    return [{
      id: presentation?.column_id || catalog.stableId,
      displayName: presentation?.display_name || item.physical_name,
      physicalName: item.physical_name,
      storageType: item.storage_type,
      nullable: item.nullable,
      defaultExpression: item.default_expression,
      generatedExpression: item.generated_expression,
      identity: item.identity_kind,
      field: presentation?.field_kind || 'text',
      format: presentation?.format_kind || 'plain-text',
      fieldConfig: presentation?.field_config || {},
      formatConfig: presentation?.format_config || {},
      hidden: false,
      readOnly: Boolean(item.generated_kind || item.identity_kind || !item.can_update)
    }];
  });
  const hiddenJson = metadata.find((item) => item.hidden_purpose === 'unstructured-json');
  const hiddenCatalog = hiddenJson?.catalog_column_id
    ? [...stable.columns.values()].find((item) => item.stableId === hiddenJson.catalog_column_id)
    : undefined;
  const hiddenNative = hiddenCatalog
    ? columns.find((item) => Number(item.attribute_number) === hiddenCatalog.attributeNumber)
    : undefined;
  const usableHiddenJson = hiddenNative?.can_read
    && hiddenCatalog?.state === 'current'
    && hiddenNative.storage_type === 'jsonb'
    && !hiddenNative.nullable
    && hiddenNative.default_expression === "'{}'::jsonb";
  const hiddenRank = metadata.find((item) => item.hidden_purpose === 'shared-rank');
  const rankCatalog = hiddenRank?.catalog_column_id
    ? [...stable.columns.values()].find((item) => item.stableId === hiddenRank.catalog_column_id)
    : undefined;
  const rankNative = rankCatalog
    ? columns.find((item) => Number(item.attribute_number) === rankCatalog.attributeNumber)
    : undefined;
  const usableRank = rankNative?.can_read
    && rankCatalog?.state === 'current'
    && rankNative.storage_type === 'text'
    && rankNative.nullable;
  const unstructured = !usableHiddenJson ? [] : metadata
    .filter((item) => item.storage_kind === 'unstructured-json')
    .map((item) => ({
    id: item.column_id,
    displayName: item.display_name,
    physicalName: '',
    storageType: 'unstructured-json',
    nullable: true,
    defaultExpression: null,
    generatedExpression: null,
    identity: '',
    field: item.field_kind,
    format: item.format_kind,
    fieldConfig: item.field_config,
    formatConfig: item.format_config,
    hidden: false,
    readOnly: !hiddenNative!.can_update
  }));
  const visibleColumnIds = new Set([...visibleNative, ...unstructured].map((item) => item.id));
  const writable = [...visibleNative, ...unstructured].some((item) => !item.readOnly);
  return {
    id: object.stableId,
    displayName,
    physical: {
      schema: native.schema_name,
      name: native.relation_name,
      kind: object.kind,
      readOnly: !native.has_row_identity
        || !['table', 'partitioned-table'].includes(object.kind)
        || !writable
    },
    hiddenSupport: {
      unstructuredJson: Boolean(usableHiddenJson),
      sharedRank: Boolean(usableRank)
    },
    columns: [...visibleNative, ...unstructured],
    constraints: constraints.flatMap((item) => {
      const sourceIds = parseNumbers(item.source_numbers).flatMap((number) => {
        const stableColumn = stableByNumber.get(number);
        if (!stableColumn) return [];
        return [metadataByCatalog.get(stableColumn.stableId)?.column_id || stableColumn.stableId];
      });
      if (!sourceIds.length || sourceIds.some((id) => !visibleColumnIds.has(id))) return [];
      const targetObject = stable.objects.get(String(item.target_relation_oid));
      return [{
        name: item.physical_name,
        kind: item.kind,
        columnIds: sourceIds,
        ...(targetObject && item.target_visible ? { targetFileId: targetObject.stableId } : {}),
        ...(targetObject && item.target_visible ? {
          targetColumnIds: parseNumbers(item.target_numbers).flatMap((number) => {
            const stableColumn = [...stable.columns.values()].find((candidate) =>
              candidate.objectId === targetObject.stableId && candidate.attributeNumber === number
            );
            return stableColumn
              ? [targetAliases.get(stableColumn.stableId) || stableColumn.stableId]
              : [];
          })
        } : {}),
        definition: item.target_visible ? item.definition : 'FOREIGN KEY (target redacted)'
      }];
    })
  };
}

/**
 * Parse the numbers.
 */
function parseNumbers(value: string | null) {
  return value?.replace(/[{}]/g, '').split(/[ ,]+/).filter(Boolean).map(Number) || [];
}

/**
 * Find the object.
 */
function findObject(stable: StableCatalogSnapshot, fileId: string) {
  return [...stable.objects.values()].find((item) => item.stableId === fileId);
}

/**
 * Return the require mutation result.
 */
function requireMutation(
  principal: BrowserPrincipal | BrowserMutationPrincipal
): asserts principal is BrowserMutationPrincipal {
  if (!isBrowserMutationPrincipal(principal)) denied();
}
/**
 * Return the denied result.
 */
function denied(): never {
  throw new ApplicationError('capability_denied', 403, 'The requested file capability is denied');
}
/**
 * Return the unavailable result.
 */
function unavailable(): never {
  throw new ApplicationError('file_unavailable', 404, 'The file is unavailable');
}
