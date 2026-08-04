import { createHash } from 'node:crypto';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type {
  CallerCatalog,
  CatalogColumn,
  CatalogFile,
  CatalogSchema,
  StableCatalogSnapshot
} from './contracts.js';

export async function discoverCallerCatalog(
  database: DatabaseExecutor,
  stable: StableCatalogSnapshot
): Promise<CallerCatalog> {
  const databaseAccess = await database.execute<{ allowed: boolean }>(`
    SELECT has_database_privilege(current_user, CAST(? AS oid), 'CONNECT') AS allowed
  `, [stable.databaseOid]);
  if (!databaseAccess.rows[0]?.allowed) {
    return { connections: [], databases: [], schemas: [] };
  }
  const [visibleSchemas, visibleObjects, visibleColumns] = await Promise.all([
    database.execute<{ namespace_oid: string | number; name: string }>(`
      SELECT n.oid AS namespace_oid, n.nspname AS name
        FROM pg_namespace n
       WHERE n.nspname <> 'tabular'
         AND n.nspname <> 'information_schema'
         AND n.nspname !~ '^pg_'
         AND has_schema_privilege(current_user, n.oid, 'USAGE')
       ORDER BY n.nspname, n.oid
    `),
    database.execute<{
      relation_oid: string | number;
      namespace_oid: string | number;
      name: string;
    }>(`
      SELECT c.oid AS relation_oid, n.oid AS namespace_oid, c.relname AS name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND NOT c.relispartition
         AND n.nspname <> 'tabular'
         AND n.nspname <> 'information_schema'
         AND n.nspname !~ '^pg_'
         AND has_schema_privilege(current_user, n.oid, 'USAGE')
         AND (
           has_table_privilege(current_user, c.oid, 'SELECT')
           OR has_any_column_privilege(current_user, c.oid, 'SELECT')
         )
       ORDER BY n.nspname, c.relname, c.oid
    `),
    database.execute<{
      relation_oid: string | number;
      attribute_number: number;
      name: string;
      formatted_type: string;
      nullable: boolean;
    }>(`
      SELECT a.attrelid AS relation_oid,
             a.attnum AS attribute_number,
             a.attname AS name,
             format_type(a.atttypid, a.atttypmod) AS formatted_type,
             NOT a.attnotnull AS nullable
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
         AND has_schema_privilege(current_user, n.oid, 'USAGE')
         AND has_column_privilege(current_user, c.oid, a.attnum, 'SELECT')
       ORDER BY a.attrelid, a.attnum
    `)
  ]);

  const columnsByObject = new Map<string, CatalogColumn[]>();
  for (const column of visibleColumns.rows) {
    const key = `${String(column.relation_oid)}:${column.attribute_number}`;
    const stableColumn = stable.columns.get(key);
    if (!stableColumn) continue;
    const list = columnsByObject.get(String(column.relation_oid)) || [];
    list.push({
      id: stableColumn.stableId,
      name: column.name,
      type: column.formatted_type,
      nullable: column.nullable,
      drift: stableColumn.state
    });
    columnsByObject.set(String(column.relation_oid), list);
  }

  const filesBySchema = new Map<string, CatalogFile[]>();
  for (const object of visibleObjects.rows) {
    const stableObject = stable.objects.get(String(object.relation_oid));
    if (!stableObject) continue;
    const list = filesBySchema.get(String(object.namespace_oid)) || [];
    list.push({
      id: stableObject.stableId,
      schemaId: stableObject.schemaId,
      name: object.name,
      kind: stableObject.kind,
      readOnly: ['view', 'materialized-view', 'foreign-table'].includes(stableObject.kind),
      drift: stableObject.state,
      columns: columnsByObject.get(String(object.relation_oid)) || []
    });
    filesBySchema.set(String(object.namespace_oid), list);
  }

  const schemas: CatalogSchema[] = [];
  for (const schema of visibleSchemas.rows) {
    const stableSchema = stable.schemas.get(String(schema.namespace_oid));
    if (!stableSchema) continue;
    schemas.push({
      id: stableSchema.stableId,
      name: schema.name,
      drift: stableSchema.state,
      files: filesBySchema.get(String(schema.namespace_oid)) || []
    });
  }
  return {
    connections: [{ id: stable.connectionId }],
    databases: [{
      id: stableDatabaseId(stable.connectionId, stable.databaseOid),
      connectionId: stable.connectionId,
      name: stable.databaseName
    }],
    schemas
  };
}

function stableDatabaseId(connectionId: string, databaseOid: string) {
  const hash = createHash('sha256')
    .update(`${connectionId}\u0000${databaseOid}`)
    .digest('base64url');
  return `db_${hash}`;
}
