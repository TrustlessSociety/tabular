//The schema migration record contract exported for module callers
export type SchemaMigrationRecord = {
  version: string,
  name: string,
  checksum: string,
  appliedAt: Date | string,
};

//The postgre sql connection scope contract exported for module callers
export type PostgreSqlConnectionScope = {
  connectionId: string,
  databaseOid: string,
  databaseName: string,
};

//The postgre sql object identity contract exported for module callers
export type PostgreSqlObjectIdentity = {
  connectionScope: PostgreSqlConnectionScope,
  oid: string,
  schemaOid: string,
  schema: string,
  name: string,
  kind: 'table' | 'partitioned-table' | 'view' | 'materialized-view' | 'foreign-table',
};
