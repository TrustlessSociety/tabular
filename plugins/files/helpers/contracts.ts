export type FileStorageType =
  | 'text'
  | 'bigint'
  | 'numeric'
  | 'boolean'
  | 'date'
  | 'time'
  | 'timestamptz'
  | 'jsonb'
  | 'uuid';

export type FileFieldKind =
  | 'text'
  | 'long-text'
  | 'number'
  | 'email'
  | 'url'
  | 'phone'
  | 'relation'
  | 'select'
  | 'radio'
  | 'suggest'
  | 'price'
  | 'switch'
  | 'checkbox'
  | 'date'
  | 'date-time'
  | 'time'
  | 'computed'
  | 'slug'
  | 'masked-text'
  | 'color'
  | 'country-code'
  | 'currency-code'
  | 'rating'
  | 'slider'
  | 'tags'
  | 'text-list'
  | 'code-source'
  | 'markdown-source';

export type FileFormatKind =
  | 'plain'
  | 'plain-text'
  | 'email-link'
  | 'clipped-text'
  | 'clipped'
  | 'wrapped'
  | 'text-transform'
  | 'number'
  | 'link'
  | 'email'
  | 'phone-link'
  | 'related-record'
  | 'badge'
  | 'currency'
  | 'yes-no'
  | 'date'
  | 'date-time'
  | 'time'
  | 'relative-time'
  | 'color'
  | 'country-label'
  | 'currency-label'
  | 'rating'
  | 'tags'
  | 'list'
  | 'code-highlighting'
  | 'label';

export type DdlLiteral =
  | { type: 'null' }
  | { type: 'text' | 'bigint' | 'numeric' | 'date' | 'time' | 'timestamptz' | 'uuid'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'jsonb'; value: string };

export type ColumnDefault =
  | { mode: 'drop' }
  | { mode: 'literal'; value: DdlLiteral }
  | { mode: 'current-timestamp' }
  | { mode: 'random-uuid' };

export type GeneratedColumn = {
  kind: 'concat-text';
  columnIds: string[];
  separator: string;
};

type FileCommand = { commandId: string };

export type FileDdlAction =
  | (FileCommand & {
    type: 'file.create';
    schemaId: string;
    displayName: string;
    physicalName?: string;
  })
  | (FileCommand & {
    type: 'file.rename';
    fileId: string;
    displayName?: string;
    physicalName?: string;
  })
  | (FileCommand & { type: 'file.drop'; fileId: string })
  | (FileCommand & {
    type: 'column.create';
    fileId: string;
    displayName: string;
    physicalName?: string;
    storageType: FileStorageType;
    field: FileFieldKind;
    format: FileFormatKind;
    fieldConfig?: Record<string, unknown>;
    formatConfig?: Record<string, unknown>;
    required?: boolean;
    unique?: boolean;
    default?: Exclude<ColumnDefault, { mode: 'drop' }>;
    generated?: GeneratedColumn;
  })
  | (FileCommand & {
    type: 'column.configure';
    fileId: string;
    columnId: string;
    displayName?: string;
    physicalName?: string;
    storageType?: FileStorageType;
    field?: FileFieldKind;
    format?: FileFormatKind;
    fieldConfig?: Record<string, unknown>;
    formatConfig?: Record<string, unknown>;
    required?: boolean;
    unique?: boolean;
    default?: ColumnDefault;
  })
  | (FileCommand & { type: 'column.drop'; fileId: string; columnId: string })
  | (FileCommand & {
    type: 'key.create';
    fileId: string;
    columnIds: string[];
    key: 'primary' | 'unique';
  })
  | (FileCommand & {
    type: 'relation.create';
    fileId: string;
    columnIds: string[];
    targetFileId: string;
    targetColumnIds: string[];
    fieldConfig?: Record<string, unknown>;
    formatConfig?: Record<string, unknown>;
    onUpdate?: 'NO ACTION' | 'RESTRICT' | 'CASCADE';
    onDelete?: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL';
  })
  | (FileCommand & {
    type: 'hidden.install';
    fileId: string;
    purpose: 'row-id' | 'unstructured-json' | 'shared-rank';
    physicalName?: string;
  })
  | (FileCommand & {
    type: 'json.promote';
    fileId: string;
    hiddenColumnId: string;
    jsonKey: string;
    displayName: string;
    physicalName?: string;
    storageType: FileStorageType;
    field: FileFieldKind;
    format: FileFormatKind;
    fieldConfig?: Record<string, unknown>;
    formatConfig?: Record<string, unknown>;
    required?: boolean;
    unique?: boolean;
  });

export type PlannedFileDdl = {
  requestId: string;
  confirmationToken: string;
  actionType: FileDdlAction['type'];
  requestDigest: string;
  expiresAt: string;
  summary: Record<string, unknown>;
};

export type ConfirmedFileDdl = {
  requestId: string;
  state: 'confirmed';
  expiresAt: string;
};

export type AppliedFileDdl = {
  requestId: string;
  state: 'applied';
  actionType: FileDdlAction['type'];
  targetFileId?: string;
  targetColumnId?: string;
  physicalName?: string;
  metadataVersion?: number;
  beforeFingerprint?: string;
  afterFingerprint?: string;
};

export type FileDdlApplyState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'dead-letter';

export type FileDdlStatus = {
  requestId: string;
  state: StoredFileDdlRequest['state'];
  actionType: FileDdlAction['type'];
  expiresAt: string;
  result?: AppliedFileDdl;
  operation?: {
    state: FileDdlApplyState;
    error?: { code: string; message: string; retryable: boolean };
  };
};

export type FileDescription = {
  id: string;
  displayName: string;
  physical: { schema: string; name: string; kind: string; readOnly: boolean };
  hiddenSupport?: {
    unstructuredJson: boolean;
    sharedRank: boolean;
  };
  columns: Array<{
    id: string;
    displayName: string;
    physicalName: string;
    storageType: string;
    nullable: boolean;
    defaultExpression: string | null;
    generatedExpression: string | null;
    identity: string;
    field: string;
    format: string;
    fieldConfig: Record<string, unknown>;
    formatConfig: Record<string, unknown>;
    hidden: boolean;
    hiddenPurpose?: string;
    readOnly: boolean;
  }>;
  constraints: Array<{
    name: string;
    kind: string;
    columnIds: string[];
    targetFileId?: string;
    targetColumnIds?: string[];
    definition: string;
  }>;
};

export type ExpectedDdlContext = {
  databaseOid: string;
  requestingRoleOid: string;
  requestingRoleName: string;
  identityGeneration?: number;
  mappingGeneration?: number;
  allowedRoleId?: string;
  roleGeneration?: number;
  ownerRoleOid?: string;
  ownerRoleName?: string;
  ddlFingerprint?: string;
  targetDdlFingerprint?: string;
  physicalNameOverridden?: boolean;
  fileMetadataVersion?: number | null;
  columnMetadataVersions?: Record<string, number | null>;
  schemaId?: string;
  namespaceOid?: string;
  schemaName?: string;
  fileId?: string;
  relationOid?: string;
  relationName?: string;
  targetFileId?: string;
  targetRelationOid?: string;
  targetSchemaName?: string;
  targetRelationName?: string;
  columnIds?: string[];
  columnAttributeNumbers?: number[];
  targetColumnIds?: string[];
  targetColumnAttributeNumbers?: number[];
  managedConstraints?: Array<{
    oid: string;
    name: string;
    kind: 'unique';
  }>;
};

export type NativeFileDdlEffect = {
  actionType: FileDdlAction['type'];
  relationOid?: string;
  physicalName?: string;
  createdConstraintName?: string;
  targetColumnPhysicalName?: string;
  hiddenPurpose?: 'row-id' | 'unstructured-json' | 'shared-rank';
  beforeFingerprint?: string;
};

export type StoredFileDdlRequest = {
  id: string;
  command_id: string;
  actor_identity_id: string;
  session_id: string;
  history_scope_id: string;
  connection_id: string;
  database_oid: string;
  requesting_role_oid: string;
  requesting_role_name: string;
  identity_generation: number;
  mapping_generation: number;
  allowed_role_id: string;
  role_generation: number;
  action_type: FileDdlAction['type'];
  request_digest: string;
  action_payload: FileDdlAction;
  expected_context: ExpectedDdlContext;
  confirmation_hash: string;
  state: 'planned' | 'confirmed' | 'applied';
  result_summary: AppliedFileDdl | null;
  expires_at: Date | string;
};
