import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import { opaqueId } from '../../identity/helpers/security.js';
import type {
  AppliedFileDdl,
  NativeFileDdlEffect,
  StoredFileDdlRequest
} from './contracts.js';
import { readRelationFingerprint } from './fingerprint.js';
import { MANAGED_ROW_ID_PHYSICAL_NAME } from './executor.js';
import { normalizedPhysicalName } from './validation.js';

export async function finalizeFileDdl(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest,
  effect: NativeFileDdlEffect
): Promise<AppliedFileDdl> {
  const action = request.action_payload;
  await assertExpectedMetadata(database, request);
  const stable = await reconcileCatalog(database, request.connection_id);
  if (action.type === 'file.drop') {
    await database.execute(`
      DELETE FROM tabular.file_managed_constraints
       WHERE object_id = ? OR target_object_id = ?
    `, [request.expected_context.fileId!, request.expected_context.fileId!]);
    await database.execute(`
      DELETE FROM tabular.column_metadata WHERE object_id = ?
    `, [request.expected_context.fileId!]);
    await database.execute(`
      DELETE FROM tabular.file_metadata WHERE object_id = ?
    `, [request.expected_context.fileId!]);
    const result: AppliedFileDdl = {
      requestId: request.id,
      state: 'applied',
      actionType: action.type,
      targetFileId: request.expected_context.fileId,
      physicalName: effect.physicalName,
      beforeFingerprint: effect.beforeFingerprint
    };
    return result;
  }
  const object = effect.relationOid ? stable.objects.get(effect.relationOid) : undefined;
  if (!object) throw new Error('Changed PostgreSQL file was not reconciled');
  const schema = [...stable.schemas.values()].find((item) => item.stableId === object.schemaId);
  if (!schema) throw new Error('Changed PostgreSQL schema was not reconciled');
  await acceptObject(database, object.stableId);

  if (action.type === 'file.create') {
    await database.execute(`
      INSERT INTO tabular.file_metadata (
        object_id, display_name, physical_name_overridden
      ) VALUES (?, ?, ?)
      ON CONFLICT (object_id) DO NOTHING
    `, [object.stableId, action.displayName, request.expected_context.physicalNameOverridden || false]);
    const rowIdColumn = [...stable.columns.values()].find((column) =>
      column.objectId === object.stableId && column.name === MANAGED_ROW_ID_PHYSICAL_NAME
    );
    if (!rowIdColumn) throw new Error('Managed PostgreSQL row identity was not reconciled');
    await acceptColumn(database, rowIdColumn.stableId);
    await database.execute(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, storage_kind,
        display_name, field_kind, format_kind, field_config,
        format_config, hidden, hidden_purpose
      ) VALUES (?, ?, ?, 'postgresql', 'Row ID', 'text', 'plain-text',
        '{}'::jsonb, '{}'::jsonb, true, 'row-id')
      ON CONFLICT (column_id) DO UPDATE SET
        catalog_column_id = EXCLUDED.catalog_column_id,
        hidden = true,
        hidden_purpose = 'row-id',
        metadata_version = tabular.column_metadata.metadata_version + 1,
        updated_at = clock_timestamp()
    `, [rowIdColumn.stableId, object.stableId, rowIdColumn.stableId]);
  } else if (action.type === 'file.rename') {
    await ensureFileMetadata(database, object.stableId, object.name);
    if (action.displayName) {
      await database.execute(`
        UPDATE tabular.file_metadata
           SET display_name = ?, metadata_version = metadata_version + 1,
               updated_at = clock_timestamp()
         WHERE object_id = ?
      `, [action.displayName, object.stableId]);
    }
    if (action.physicalName) {
      const overridden = !action.displayName
        || normalizedPhysicalName(action.displayName) !== action.physicalName;
      await database.execute(`
        UPDATE tabular.file_metadata
           SET physical_name_overridden = ?,
               metadata_version = metadata_version + 1,
               updated_at = clock_timestamp()
         WHERE object_id = ?
      `, [overridden, object.stableId]);
    }
  } else {
    await ensureFileMetadata(database, object.stableId, object.name);
  }

  let targetColumnId: string | undefined;
  if (effect.targetColumnPhysicalName) {
    const catalogColumn = [...stable.columns.values()].find((item) =>
      item.objectId === object.stableId && item.name === effect.targetColumnPhysicalName
    );
    if (!catalogColumn) throw new Error('Changed PostgreSQL column was not reconciled');
    await acceptColumn(database, catalogColumn.stableId);
    if (action.type === 'json.promote') {
      const updated = await database.execute(`
        UPDATE tabular.column_metadata
           SET catalog_column_id = ?, storage_kind = 'postgresql',
               display_name = ?, field_kind = ?, format_kind = ?, field_config = ?::jsonb,
               format_config = ?::jsonb,
               metadata_version = metadata_version + 1, updated_at = clock_timestamp()
         WHERE column_id = ? AND object_id = ? AND storage_kind = 'unstructured-json'
      `, [
        catalogColumn.stableId,
        action.displayName,
        action.field,
        action.format,
        JSON.stringify(action.fieldConfig || {}),
        JSON.stringify(action.formatConfig || {}),
        action.jsonKey,
        object.stableId
      ]);
      if (updated.affectedRows !== 1) throw new Error('Promoted logical field changed before commit');
      targetColumnId = action.jsonKey;
    } else {
      const logicalId = action.type === 'column.configure'
        ? action.columnId
        : catalogColumn.stableId;
      const axes = columnAxes(action, effect.targetColumnPhysicalName);
      await database.execute(`
        INSERT INTO tabular.column_metadata (
          column_id, object_id, catalog_column_id, storage_kind,
          display_name, field_kind, format_kind, field_config,
          format_config,
          hidden, hidden_purpose
        ) VALUES (?, ?, ?, 'postgresql', ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
        ON CONFLICT (column_id) DO UPDATE SET
          catalog_column_id = EXCLUDED.catalog_column_id,
          display_name = COALESCE(?, tabular.column_metadata.display_name),
          field_kind = COALESCE(?, tabular.column_metadata.field_kind),
          format_kind = COALESCE(?, tabular.column_metadata.format_kind),
          field_config = COALESCE(?::jsonb, tabular.column_metadata.field_config),
          format_config = COALESCE(?::jsonb, tabular.column_metadata.format_config),
          metadata_version = tabular.column_metadata.metadata_version + 1,
          updated_at = clock_timestamp()
      `, [
        logicalId,
        object.stableId,
        catalogColumn.stableId,
        axes.displayName,
        axes.field,
        axes.format,
        JSON.stringify(axes.config),
        JSON.stringify(axes.formatConfig),
        axes.hidden,
        axes.hiddenPurpose,
        axes.updateDisplayName,
        axes.updateField,
        axes.updateFormat,
        axes.updateConfig === undefined ? null : JSON.stringify(axes.updateConfig),
        axes.updateFormatConfig === undefined ? null : JSON.stringify(axes.updateFormatConfig)
      ]);
      targetColumnId = logicalId;
    }
  }
  if (action.type === 'column.drop') {
    await database.execute(`
      DELETE FROM tabular.file_managed_constraints
       WHERE (object_id = ?
         AND source_column_ids @> jsonb_build_array(?::text))
          OR (target_object_id = ?
         AND target_column_ids @> jsonb_build_array(?::text))
    `, [object.stableId, action.columnId, object.stableId, action.columnId]);
    await database.execute('DELETE FROM tabular.column_metadata WHERE column_id = ? AND object_id = ?', [
      action.columnId,
      object.stableId
    ]);
  }
  if (action.type === 'column.configure' && action.unique === false) {
    for (const constraint of request.expected_context.managedConstraints || []) {
      await database.execute(`
        DELETE FROM tabular.file_managed_constraints
         WHERE object_id = ? AND constraint_oid = ?::oid AND physical_name = ?
      `, [object.stableId, constraint.oid, constraint.name]);
    }
  }
  if (action.type === 'relation.create') {
    await finalizeRelationMetadata(database, stable, object.stableId, action);
  }
  if (effect.createdConstraintName) {
    await recordConstraint(database, request, object.stableId, targetColumnId, effect.createdConstraintName);
  }
  const metadata = await database.execute<{ metadata_version: string | number }>(`
    SELECT metadata_version FROM tabular.file_metadata WHERE object_id = ?
  `, [object.stableId]);
  const afterFingerprint = await readRelationFingerprint(database, object.relationOid);
  return {
    requestId: request.id,
    state: 'applied',
    actionType: action.type,
    targetFileId: object.stableId,
    ...(targetColumnId ? { targetColumnId } : {}),
    ...((effect.physicalName || effect.targetColumnPhysicalName)
      ? { physicalName: effect.physicalName || effect.targetColumnPhysicalName }
      : {}),
    metadataVersion: Number(metadata.rows[0]?.metadata_version || 1),
    beforeFingerprint: effect.beforeFingerprint,
    afterFingerprint
  };
}

async function finalizeRelationMetadata(
  database: DatabaseExecutor,
  stable: Awaited<ReturnType<typeof reconcileCatalog>>,
  objectId: string,
  action: Extract<StoredFileDdlRequest['action_payload'], { type: 'relation.create' }>
) {
  for (const sourceId of action.columnIds) {
    const catalogColumn = [...stable.columns.values()].find((column) =>
      column.objectId === objectId && column.stableId === sourceId
    );
    if (!catalogColumn) throw new Error('Relation source metadata was unavailable');
    await database.execute(`
      INSERT INTO tabular.column_metadata (
        column_id, object_id, catalog_column_id, storage_kind,
        display_name, field_kind, format_kind, field_config, format_config
      ) VALUES (?, ?, ?, 'postgresql', ?, 'relation', 'related-record', ?::jsonb, ?::jsonb)
      ON CONFLICT (column_id) DO UPDATE SET
        field_kind = 'relation', format_kind = 'related-record',
        field_config = tabular.column_metadata.field_config || EXCLUDED.field_config,
        format_config = tabular.column_metadata.format_config || EXCLUDED.format_config,
        metadata_version = tabular.column_metadata.metadata_version + 1,
        updated_at = clock_timestamp()
    `, [
      sourceId,
      objectId,
      catalogColumn.stableId,
      catalogColumn.name,
      JSON.stringify(action.fieldConfig || {}),
      JSON.stringify(action.formatConfig || {})
    ]);
  }
}

async function assertExpectedMetadata(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest
) {
  const expected = request.expected_context;
  if (expected.fileId && expected.fileMetadataVersion !== undefined) {
    const file = await database.execute<{ metadata_version: string | number }>(`
      SELECT metadata_version FROM tabular.file_metadata
       WHERE object_id = ? FOR UPDATE
    `, [expected.fileId]);
    const current = file.rows[0] ? Number(file.rows[0].metadata_version) : null;
    if (current !== expected.fileMetadataVersion) metadataStale();
  }
  for (const [columnId, version] of Object.entries(expected.columnMetadataVersions || {})) {
    const column = await database.execute<{ metadata_version: string | number }>(`
      SELECT metadata_version FROM tabular.column_metadata
       WHERE object_id = ? AND column_id = ? FOR UPDATE
    `, [expected.fileId!, columnId]);
    const current = column.rows[0] ? Number(column.rows[0].metadata_version) : null;
    if (current !== version) metadataStale();
  }
}

function metadataStale(): never {
  throw new ApplicationError(
    'file_ddl_stale',
    409,
    'The file presentation metadata changed after this schema-change plan was created'
  );
}

async function ensureFileMetadata(database: DatabaseExecutor, objectId: string, fallback: string) {
  await database.execute(`
    INSERT INTO tabular.file_metadata (object_id, display_name)
    VALUES (?, ?) ON CONFLICT (object_id) DO NOTHING
  `, [objectId, fallback]);
}

async function acceptObject(database: DatabaseExecutor, objectId: string) {
  await database.execute(`
    UPDATE tabular.catalog_objects
       SET accepted_schema = observed_schema, accepted_name = observed_name,
           accepted_fingerprint = observed_fingerprint, state = 'current'
     WHERE id = ? AND state IN ('current', 'renamed', 'changed')
  `, [objectId]);
}

async function acceptColumn(database: DatabaseExecutor, columnId: string) {
  await database.execute(`
    UPDATE tabular.catalog_columns
       SET accepted_name = observed_name, accepted_fingerprint = observed_fingerprint,
           state = 'current'
     WHERE id = ? AND state IN ('current', 'renamed', 'changed')
  `, [columnId]);
}

function columnAxes(
  action: StoredFileDdlRequest['action_payload'],
  fallback: string
) {
  if (action.type === 'hidden.install') {
    return {
      displayName: fallback,
      field: action.purpose === 'unstructured-json' ? 'text' : 'text',
      format: 'plain-text',
      config: {},
      formatConfig: {},
      hidden: true,
      hiddenPurpose: action.purpose,
      updateDisplayName: fallback,
      updateField: 'text',
      updateFormat: 'plain-text',
      updateConfig: {},
      updateFormatConfig: {}
    };
  }
  if (action.type === 'column.create') {
    return {
      displayName: action.displayName,
      field: action.field,
      format: action.format,
      config: action.fieldConfig || {},
      formatConfig: action.formatConfig || {},
      hidden: false,
      hiddenPurpose: null,
      updateDisplayName: action.displayName,
      updateField: action.field,
      updateFormat: action.format,
      updateConfig: action.fieldConfig || {},
      updateFormatConfig: action.formatConfig || {}
    };
  }
  if (action.type === 'column.configure') {
    return {
      displayName: action.displayName || fallback,
      field: action.field || 'text',
      format: action.format || 'plain-text',
      config: action.fieldConfig || {},
      formatConfig: action.formatConfig || {},
      hidden: false,
      hiddenPurpose: null,
      updateDisplayName: action.displayName || null,
      updateField: action.field || null,
      updateFormat: action.format || null,
      updateConfig: action.fieldConfig,
      updateFormatConfig: action.formatConfig
    };
  }
  throw new Error('The action does not create or configure a PostgreSQL column');
}

async function recordConstraint(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest,
  objectId: string,
  createdColumnId: string | undefined,
  name: string
) {
  const native = await database.execute<{ oid: string | number }>(`
    SELECT oid FROM pg_constraint WHERE conrelid = ?::oid AND conname = ?
  `, [request.expected_context.relationOid || null, name]);
  const oid = native.rows[0]?.oid;
  if (!oid) throw new Error('Created native constraint identity was unavailable');
  const action = request.action_payload;
  const sourceIds = action.type === 'key.create' || action.type === 'relation.create'
    ? action.columnIds
    : createdColumnId ? [createdColumnId] : [];
  const targetObjectId = action.type === 'relation.create' ? action.targetFileId : null;
  const targetColumnIds = action.type === 'relation.create' ? action.targetColumnIds : null;
  const kind = action.type === 'relation.create'
    ? 'foreign-key'
    : action.type === 'key.create' && action.key === 'primary'
      ? 'primary-key'
      : 'unique';
  await database.execute(`
    INSERT INTO tabular.file_managed_constraints (
      id, object_id, constraint_oid, physical_name, constraint_kind,
      source_column_ids, target_object_id, target_column_ids, created_by_request_id
    ) VALUES (?, ?, ?::oid, ?, ?, ?::jsonb, ?, ?::jsonb, ?)
  `, [
    `constraint_${opaqueId('act').slice('act_'.length)}`,
    objectId,
    String(oid),
    name,
    kind,
    JSON.stringify(sourceIds),
    targetObjectId,
    targetColumnIds ? JSON.stringify(targetColumnIds) : null,
    request.id
  ]);
}
