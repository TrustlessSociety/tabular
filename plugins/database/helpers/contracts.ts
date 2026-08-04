export type SchemaMigrationRecord = {
  version: string;
  name: string;
  checksum: string;
  appliedAt: Date | string;
};

export type PostgreSqlConnectionScope = {
  connectionId: string;
  databaseOid: string;
  databaseName: string;
};

export type PostgreSqlObjectIdentity = {
  connectionScope: PostgreSqlConnectionScope;
  oid: string;
  schemaOid: string;
  schema: string;
  name: string;
  kind: 'table' | 'partitioned-table' | 'view' | 'materialized-view' | 'foreign-table';
};
