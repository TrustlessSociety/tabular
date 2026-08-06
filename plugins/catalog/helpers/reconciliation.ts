//node
import { createHash } from 'node:crypto';

//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type {
  CatalogFile,
  StableCatalogSnapshot,
  StableColumn,
  StableObject,
  StableSchema
} from './contracts.js';
import { opaqueId } from '../../identity/helpers/security.js';

type LiveSchema = { database_oid: string | number, namespace_oid: string | number, name: string, };
type LiveObject = {
  relation_oid: string | number,
  namespace_oid: string | number,
  schema_name: string,
  name: string,
  relkind: string,
  view_definition: string | null,
};
type LiveColumn = {
  relation_oid: string | number,
  attribute_number: number,
  name: string,
  formatted_type: string,
  nullable: boolean,
  identity_kind: string,
  generated_kind: string,
};

let reconciliationTail = Promise.resolve();

/**
 * Reconcile the catalog.
 */
export async function reconcileCatalog(
  database: DatabaseExecutor,
  connectionId: string
): Promise<StableCatalogSnapshot> {
  const previous = reconciliationTail;
  let release!: () => void;
  reconciliationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await reconcileCatalogTransaction(database, connectionId);
  } finally {
    release();
  }
}

/**
 * Reconcile the catalog transaction.
 */
async function reconcileCatalogTransaction(
  database: DatabaseExecutor,
  connectionId: string
): Promise<StableCatalogSnapshot> {
  const scope = await database.execute<{
    database_oid: string | number,
    database_name: string,
  }>(`
    SELECT oid AS database_oid, datname AS database_name
      FROM pg_database
     WHERE datname = current_database()
  `);
  const current = scope.rows[0];
  if (!current) throw new Error('Current PostgreSQL database scope was unavailable');
  const databaseOid = String(current.database_oid);
  await database.execute(`
    SELECT pg_advisory_xact_lock(hashtextextended('tabular-catalog:' || ? || ':' || ?, 0))
  `, [connectionId, databaseOid]);

  const [schemaResult, objectResult, columnResult] = await Promise.all([
    database.execute<LiveSchema>(`
      SELECT d.oid AS database_oid, n.oid AS namespace_oid, n.nspname AS name
        FROM pg_database d
        CROSS JOIN pg_namespace n
       WHERE d.datname = current_database()
         AND n.nspname <> 'tabular'
         AND n.nspname <> 'information_schema'
         AND n.nspname !~ '^pg_'
       ORDER BY n.oid
    `),
    database.execute<LiveObject>(`
      SELECT c.oid AS relation_oid,
             n.oid AS namespace_oid,
             n.nspname AS schema_name,
             c.relname AS name,
             c.relkind,
             CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, false) ELSE NULL END
               AS view_definition
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND NOT c.relispartition
         AND n.nspname <> 'tabular'
         AND n.nspname <> 'information_schema'
         AND n.nspname !~ '^pg_'
       ORDER BY c.oid
    `),
    database.execute<LiveColumn>(`
      SELECT a.attrelid AS relation_oid,
             a.attnum AS attribute_number,
             a.attname AS name,
             format_type(a.atttypid, a.atttypmod) AS formatted_type,
             NOT a.attnotnull AS nullable,
             a.attidentity AS identity_kind,
             a.attgenerated AS generated_kind
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE a.attnum > 0
         AND NOT a.attisdropped
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND NOT c.relispartition
         AND n.nspname <> 'tabular'
         AND n.nspname <> 'information_schema'
         AND n.nspname !~ '^pg_'
       ORDER BY a.attrelid, a.attnum
    `)
  ]);

  const schemas = await reconcileSchemas(
    database,
    connectionId,
    databaseOid,
    schemaResult.rows
  );
  const objects = await reconcileObjects(
    database,
    connectionId,
    databaseOid,
    schemas,
    objectResult.rows
  );
  const columns = await reconcileColumns(database, objects, columnResult.rows);
  return {
    connectionId,
    databaseOid,
    databaseName: current.database_name,
    schemas,
    objects,
    columns
  };
}

/**
 * Reconcile the schemas.
 */
async function reconcileSchemas(
  database: DatabaseExecutor,
  connectionId: string,
  databaseOid: string,
  live: LiveSchema[]
) {
  const stored = await database.execute<{
    id: string,
    namespace_oid: string | number,
    accepted_name: string,
    observed_name: string,
    state: string,
  }>(`
    SELECT id, namespace_oid, accepted_name, observed_name, state
      FROM tabular.catalog_schemas
     WHERE connection_id = ? AND database_oid = ?
       AND state IN ('current', 'renamed')
     FOR UPDATE
  `, [connectionId, databaseOid]);
  const byOid = new Map(stored.rows.map((row) => [String(row.namespace_oid), row]));
  const seen = new Set(live.map((item) => String(item.namespace_oid)));
  for (const row of stored.rows) {
    if (!seen.has(String(row.namespace_oid))) {
      await database.execute(`
        UPDATE tabular.catalog_schemas
           SET state = 'missing', missing_at = clock_timestamp()
         WHERE id = ?
      `, [row.id]);
    }
  }
  for (const item of live) {
    const oid = String(item.namespace_oid);
    const existing = byOid.get(oid);
    if (existing) {
      const state = existing.accepted_name === item.name ? 'current' : 'renamed';
      await database.execute(`
        UPDATE tabular.catalog_schemas
           SET observed_name = ?, state = ?, last_seen_at = clock_timestamp(), missing_at = NULL
         WHERE id = ?
      `, [item.name, state, existing.id]);
    } else {
      const id = `schema_${opaqueId('schema').slice('schema_'.length)}`;
      await database.execute(`
        UPDATE tabular.catalog_schemas
           SET state = 'replaced'
         WHERE connection_id = ? AND database_oid = ?
           AND observed_name = ? AND state = 'missing'
      `, [connectionId, databaseOid, item.name]);
      await database.execute(`
        INSERT INTO tabular.catalog_schemas (
          id, connection_id, database_oid, namespace_oid, accepted_name, observed_name
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [id, connectionId, databaseOid, oid, item.name, item.name]);
      byOid.set(oid, {
        id,
        namespace_oid: oid,
        accepted_name: item.name,
        observed_name: item.name,
        state: 'current'
      });
    }
  }
  const output = new Map<string, StableSchema>();
  for (const item of live) {
    const row = byOid.get(String(item.namespace_oid))!;
    output.set(String(item.namespace_oid), {
      stableId: row.id,
      databaseOid,
      namespaceOid: String(item.namespace_oid),
      name: item.name,
      state: row.accepted_name === item.name ? 'current' : 'renamed'
    });
  }
  return output;
}

/**
 * Reconcile the objects.
 */
async function reconcileObjects(
  database: DatabaseExecutor,
  connectionId: string,
  databaseOid: string,
  schemas: Map<string, StableSchema>,
  live: LiveObject[]
) {
  const stored = await database.execute<{
    id: string,
    relation_oid: string | number,
    accepted_schema: string,
    accepted_name: string,
    accepted_fingerprint: string,
  }>(`
    SELECT id, relation_oid, accepted_schema, accepted_name, accepted_fingerprint
      FROM tabular.catalog_objects
     WHERE connection_id = ? AND database_oid = ?
       AND state IN ('current', 'renamed', 'changed')
     FOR UPDATE
  `, [connectionId, databaseOid]);
  const byOid = new Map(stored.rows.map((row) => [String(row.relation_oid), row]));
  const seen = new Set(live.map((item) => String(item.relation_oid)));
  for (const row of stored.rows) {
    if (!seen.has(String(row.relation_oid))) {
      await database.execute(`
        UPDATE tabular.catalog_objects
           SET state = 'missing', missing_at = clock_timestamp()
         WHERE id = ?
      `, [row.id]);
      await database.execute(`
        UPDATE tabular.catalog_columns
           SET state = 'missing', missing_at = clock_timestamp()
         WHERE object_id = ? AND state IN ('current', 'renamed', 'changed')
      `, [row.id]);
    }
  }
  for (const item of live) {
    const oid = String(item.relation_oid);
    const schema = schemas.get(String(item.namespace_oid));
    if (!schema) continue;
    const kind = objectKind(item.relkind);
    const fingerprint = digest([kind, item.view_definition || '']);
    const existing = byOid.get(oid);
    if (existing) {
      const state = existing.accepted_fingerprint !== fingerprint
        ? 'changed'
        : existing.accepted_schema !== item.schema_name || existing.accepted_name !== item.name
          ? 'renamed'
          : 'current';
      await database.execute(`
        UPDATE tabular.catalog_objects
           SET schema_id = ?, object_kind = ?, observed_schema = ?, observed_name = ?,
               observed_fingerprint = ?, state = ?, last_seen_at = clock_timestamp(), missing_at = NULL
         WHERE id = ?
      `, [schema.stableId, kind, item.schema_name, item.name, fingerprint, state, existing.id]);
    } else {
      const id = opaqueId('obj');
      await database.execute(`
        UPDATE tabular.catalog_objects
           SET state = 'replaced'
         WHERE connection_id = ? AND database_oid = ?
           AND observed_schema = ? AND observed_name = ? AND state = 'missing'
      `, [connectionId, databaseOid, item.schema_name, item.name]);
      await database.execute(`
        INSERT INTO tabular.catalog_objects (
          id, schema_id, connection_id, database_oid, relation_oid, object_kind,
          accepted_schema, accepted_name, observed_schema, observed_name,
          accepted_fingerprint, observed_fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        schema.stableId,
        connectionId,
        databaseOid,
        oid,
        kind,
        item.schema_name,
        item.name,
        item.schema_name,
        item.name,
        fingerprint,
        fingerprint
      ]);
      byOid.set(oid, {
        id,
        relation_oid: oid,
        accepted_schema: item.schema_name,
        accepted_name: item.name,
        accepted_fingerprint: fingerprint
      });
    }
  }
  const output = new Map<string, StableObject>();
  for (const item of live) {
    const row = byOid.get(String(item.relation_oid));
    const schema = schemas.get(String(item.namespace_oid));
    if (!row || !schema) continue;
    const fingerprint = digest([objectKind(item.relkind), item.view_definition || '']);
    output.set(String(item.relation_oid), {
      stableId: row.id,
      schemaId: schema.stableId,
      relationOid: String(item.relation_oid),
      name: item.name,
      kind: objectKind(item.relkind),
      state: row.accepted_fingerprint !== fingerprint
        ? 'changed'
        : row.accepted_schema !== item.schema_name || row.accepted_name !== item.name
          ? 'renamed'
          : 'current'
    });
  }
  return output;
}

/**
 * Reconcile the columns.
 */
async function reconcileColumns(
  database: DatabaseExecutor,
  objects: Map<string, StableObject>,
  live: LiveColumn[]
) {
  const objectIds = new Set([...objects.values()].map((item) => item.stableId));
  const stored = await database.execute<{
    id: string,
    object_id: string,
    attribute_number: number,
    accepted_name: string,
    accepted_fingerprint: string,
  }>(`
    SELECT id, object_id, attribute_number, accepted_name, accepted_fingerprint
      FROM tabular.catalog_columns
     WHERE state IN ('current', 'renamed', 'changed')
     FOR UPDATE
  `);
  const byKey = new Map(
    stored.rows
      .filter((row) => objectIds.has(row.object_id))
      .map((row) => [`${row.object_id}:${row.attribute_number}`, row])
  );
  const seen = new Set(live.flatMap((item) => {
    const object = objects.get(String(item.relation_oid));
    return object ? [`${object.stableId}:${item.attribute_number}`] : [];
  }));
  for (const row of stored.rows) {
    const key = `${row.object_id}:${row.attribute_number}`;
    if (objectIds.has(row.object_id) && !seen.has(key)) {
      await database.execute(`
        UPDATE tabular.catalog_columns
           SET state = 'missing', missing_at = clock_timestamp()
         WHERE id = ?
      `, [row.id]);
    }
  }
  for (const item of live) {
    const object = objects.get(String(item.relation_oid));
    if (!object) continue;
    const key = `${object.stableId}:${item.attribute_number}`;
    const fingerprint = digest([
      item.formatted_type,
      String(item.nullable),
      item.identity_kind,
      item.generated_kind
    ]);
    const existing = byKey.get(key);
    if (existing) {
      const state = existing.accepted_fingerprint !== fingerprint
        ? 'changed'
        : existing.accepted_name !== item.name
          ? 'renamed'
          : 'current';
      await database.execute(`
        UPDATE tabular.catalog_columns
           SET observed_name = ?, observed_fingerprint = ?, state = ?,
               last_seen_at = clock_timestamp(), missing_at = NULL
         WHERE id = ?
      `, [item.name, fingerprint, state, existing.id]);
    } else {
      const id = opaqueId('col');
      await database.execute(`
        UPDATE tabular.catalog_columns
           SET state = 'replaced'
         WHERE object_id = ? AND observed_name = ? AND state = 'missing'
      `, [object.stableId, item.name]);
      await database.execute(`
        INSERT INTO tabular.catalog_columns (
          id, object_id, attribute_number, accepted_name, observed_name,
          accepted_fingerprint, observed_fingerprint
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        object.stableId,
        item.attribute_number,
        item.name,
        item.name,
        fingerprint,
        fingerprint
      ]);
      byKey.set(key, {
        id,
        object_id: object.stableId,
        attribute_number: item.attribute_number,
        accepted_name: item.name,
        accepted_fingerprint: fingerprint
      });
    }
  }
  const output = new Map<string, StableColumn>();
  for (const item of live) {
    const object = objects.get(String(item.relation_oid));
    if (!object) continue;
    const row = byKey.get(`${object.stableId}:${item.attribute_number}`);
    if (!row) continue;
    const fingerprint = digest([
      item.formatted_type,
      String(item.nullable),
      item.identity_kind,
      item.generated_kind
    ]);
    output.set(`${String(item.relation_oid)}:${item.attribute_number}`, {
      stableId: row.id,
      objectId: object.stableId,
      attributeNumber: item.attribute_number,
      name: item.name,
      state: row.accepted_fingerprint !== fingerprint
        ? 'changed'
        : row.accepted_name !== item.name
          ? 'renamed'
          : 'current'
    });
  }
  return output;
}

/**
 * Return the object kind result.
 */
function objectKind(relkind: string): CatalogFile['kind'] {
  if (relkind === 'r') return 'table';
  if (relkind === 'p') return 'partitioned-table';
  if (relkind === 'v') return 'view';
  if (relkind === 'm') return 'materialized-view';
  if (relkind === 'f') return 'foreign-table';
  throw new Error(`Unsupported PostgreSQL relation kind: ${relkind}`);
}

/**
 * Return the digest result.
 */
function digest(parts: string[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
