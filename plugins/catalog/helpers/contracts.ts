export type CatalogColumn = {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  drift: 'current' | 'renamed' | 'changed';
};

export type CatalogFile = {
  id: string;
  schemaId: string;
  name: string;
  kind: 'table' | 'partitioned-table' | 'view' | 'materialized-view' | 'foreign-table';
  readOnly: boolean;
  drift: 'current' | 'renamed' | 'changed';
  columns: CatalogColumn[];
};

export type CatalogSchema = {
  id: string;
  name: string;
  drift: 'current' | 'renamed';
  files: CatalogFile[];
};

export type CallerCatalog = {
  connections: Array<{ id: string }>;
  databases: Array<{ id: string; connectionId: string; name: string }>;
  schemas: CatalogSchema[];
};

export type StableSchema = {
  stableId: string;
  databaseOid: string;
  namespaceOid: string;
  name: string;
  state: 'current' | 'renamed';
};

export type StableObject = {
  stableId: string;
  schemaId: string;
  relationOid: string;
  name: string;
  kind: CatalogFile['kind'];
  state: CatalogFile['drift'];
};

export type StableColumn = {
  stableId: string;
  objectId: string;
  attributeNumber: number;
  name: string;
  state: CatalogColumn['drift'];
};

export type StableCatalogSnapshot = {
  connectionId: string;
  databaseOid: string;
  databaseName: string;
  schemas: Map<string, StableSchema>;
  objects: Map<string, StableObject>;
  columns: Map<string, StableColumn>;
};
