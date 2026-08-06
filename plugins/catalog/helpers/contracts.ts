//The catalog column contract exported for module callers
export type CatalogColumn = {
  id: string,
  name: string,
  type: string,
  nullable: boolean,
  drift: 'current' | 'renamed' | 'changed',
};

//The catalog file contract exported for module callers
export type CatalogFile = {
  id: string,
  schemaId: string,
  name: string,
  kind: 'table' | 'partitioned-table' | 'view' | 'materialized-view' | 'foreign-table',
  readOnly: boolean,
  drift: 'current' | 'renamed' | 'changed',
  columns: CatalogColumn[],
};

//The catalog schema contract exported for module callers
export type CatalogSchema = {
  id: string,
  name: string,
  drift: 'current' | 'renamed',
  files: CatalogFile[],
};

//The caller catalog contract exported for module callers
export type CallerCatalog = {
  connections: Array<{ id: string, }>,
  databases: Array<{ id: string, connectionId: string, name: string, }>,
  schemas: CatalogSchema[],
};

//The stable schema contract exported for module callers
export type StableSchema = {
  stableId: string,
  databaseOid: string,
  namespaceOid: string,
  name: string,
  state: 'current' | 'renamed',
};

//The stable object contract exported for module callers
export type StableObject = {
  stableId: string,
  schemaId: string,
  relationOid: string,
  name: string,
  kind: CatalogFile['kind'],
  state: CatalogFile['drift'],
};

//The stable column contract exported for module callers
export type StableColumn = {
  stableId: string,
  objectId: string,
  attributeNumber: number,
  name: string,
  state: CatalogColumn['drift'],
};

//The stable catalog snapshot contract exported for module callers
export type StableCatalogSnapshot = {
  connectionId: string,
  databaseOid: string,
  databaseName: string,
  schemas: Map<string, StableSchema>,
  objects: Map<string, StableObject>,
  columns: Map<string, StableColumn>,
};
