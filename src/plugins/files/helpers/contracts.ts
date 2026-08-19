//The file storage type contract exported for module callers
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

//The file field kind contract exported for module callers
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
  | 'metadata'
  | 'tags'
  | 'text-list'
  | 'multi-select'
  | 'checkbox-list'
  | 'code-source'
  | 'markdown-source';

//The file format kind contract exported for module callers
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
  | 'spread'
  | 'metadata'
  | 'markdown'
  | 'code-highlighting'
  | 'label';

//The validator rule kinds are closed metadata, never executable dispatch names
export type ValidatorRuleKind =
  | 'not_empty'
  | 'equals'
  | 'not_equals'
  | 'one_of'
  | 'starts_with'
  | 'ends_with'
  | 'pattern'
  | 'min_length'
  | 'max_length'
  | 'exact_length'
  | 'min_words'
  | 'max_words'
  | 'exact_words'
  | 'email_shape'
  | 'url_shape'
  | 'hex_shape'
  | 'min_value'
  | 'max_value'
  | 'integer_value'
  | 'multiple_of'
  | 'before'
  | 'after'
  | 'past'
  | 'future'
  | 'today'
  | 'min_items'
  | 'max_items'
  | 'exact_items'
  | 'unique_items'
  | 'items'
  | 'required_keys'
  | 'allowed_keys'
  | 'properties';

//The configured validator rule contract stored in Tabular metadata
export type ValidatorRuleConfig = {
  id: string,
  kind: ValidatorRuleKind,
  args: Record<string, unknown>,
  message?: string,
};

//The versioned validator configuration contract stored per column
export type ValidatorConfig = {
  version: 1,
  rules: ValidatorRuleConfig[],
};

//The metadata-only column presentation update contract
export type ColumnPresentationUpdate = {
  fileId: string,
  columnId: string,
  expectedMetadataVersion: number,
  storageType: FileStorageType,
  field: FileFieldKind,
  format: FileFormatKind,
  fieldConfig: Record<string, unknown>,
  formatConfig: Record<string, unknown>,
  validatorConfig: ValidatorConfig,
};

//The ddl literal contract exported for module callers
export type DdlLiteral =
  | { type: 'null', }
  | { type: 'text' | 'bigint' | 'numeric' | 'date' | 'time' | 'timestamptz' | 'uuid', value: string, }
  | { type: 'boolean', value: boolean, }
  | { type: 'jsonb', value: string, };

//The column default contract exported for module callers
export type ColumnDefault =
  | { mode: 'drop', }
  | { mode: 'literal', value: DdlLiteral, }
  | { mode: 'current-timestamp', }
  | { mode: 'random-uuid', };

//The generated column contract exported for module callers
export type GeneratedColumn = {
  kind: 'concat-text',
  columnIds: string[],
  separator: string,
};

type FileCommand = { commandId: string, };

//The file ddl action contract exported for module callers
export type FileDdlAction =
  | (FileCommand & {
    type: 'file.create',
    schemaId: string,
    displayName: string,
    physicalName?: string,
  })
  | (FileCommand & {
    type: 'file.rename',
    fileId: string,
    displayName?: string,
    physicalName?: string,
  })
  | (FileCommand & { type: 'file.drop', fileId: string, })
  | (FileCommand & {
    type: 'column.create',
    fileId: string,
    displayName: string,
    physicalName?: string,
    storageType: FileStorageType,
    field: FileFieldKind,
    format: FileFormatKind,
    fieldConfig?: Record<string, unknown>,
    formatConfig?: Record<string, unknown>,
    validatorConfig?: ValidatorConfig,
    required?: boolean,
    unique?: boolean,
    default?: Exclude<ColumnDefault, { mode: 'drop', }>,
    generated?: GeneratedColumn,
  })
  | (FileCommand & {
    type: 'column.configure',
    fileId: string,
    columnId: string,
    displayName?: string,
    physicalName?: string,
    storageType?: FileStorageType,
    field?: FileFieldKind,
    format?: FileFormatKind,
    fieldConfig?: Record<string, unknown>,
    formatConfig?: Record<string, unknown>,
    validatorConfig?: ValidatorConfig,
    required?: boolean,
    unique?: boolean,
    default?: ColumnDefault,
  })
  | (FileCommand & { type: 'column.drop', fileId: string, columnId: string, })
  | (FileCommand & {
    type: 'key.create',
    fileId: string,
    columnIds: string[],
    key: 'primary' | 'unique',
  })
  | (FileCommand & {
    type: 'relation.create',
    fileId: string,
    columnIds: string[],
    targetFileId: string,
    targetColumnIds: string[],
    fieldConfig?: Record<string, unknown>,
    formatConfig?: Record<string, unknown>,
    onUpdate?: 'NO ACTION' | 'RESTRICT' | 'CASCADE',
    onDelete?: 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL',
  })
  | (FileCommand & {
    type: 'hidden.install',
    fileId: string,
    purpose: 'row-id' | 'unstructured-json' | 'shared-rank',
    physicalName?: string,
  })
  | (FileCommand & {
    type: 'json.promote',
    fileId: string,
    hiddenColumnId: string,
    jsonKey: string,
    displayName: string,
    physicalName?: string,
    storageType: FileStorageType,
    field: FileFieldKind,
    format: FileFormatKind,
    fieldConfig?: Record<string, unknown>,
    formatConfig?: Record<string, unknown>,
    validatorConfig?: ValidatorConfig,
    required?: boolean,
    unique?: boolean,
  });

//The planned file ddl contract exported for module callers
export type PlannedFileDdl = {
  requestId: string,
  confirmationToken: string,
  actionType: FileDdlAction['type'],
  requestDigest: string,
  expiresAt: string,
  summary: Record<string, unknown>,
};

//The confirmed file ddl contract exported for module callers
export type ConfirmedFileDdl = {
  requestId: string,
  state: 'confirmed',
  expiresAt: string,
};

//The applied file ddl contract exported for module callers
export type AppliedFileDdl = {
  requestId: string,
  state: 'applied',
  actionType: FileDdlAction['type'],
  targetFileId?: string,
  targetColumnId?: string,
  physicalName?: string,
  metadataVersion?: number,
  beforeFingerprint?: string,
  afterFingerprint?: string,
};

//The file ddl apply state contract exported for module callers
export type FileDdlApplyState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'dead-letter';

//The file ddl status contract exported for module callers
export type FileDdlStatus = {
  requestId: string,
  state: StoredFileDdlRequest['state'],
  actionType: FileDdlAction['type'],
  expiresAt: string,
  result?: AppliedFileDdl,
  operation?: {
    state: FileDdlApplyState,
    error?: { code: string, message: string, retryable: boolean, },
  },
};

//The file description contract exported for module callers
export type FileDescription = {
  id: string,
  displayName: string,
  physical: { schema: string, name: string, kind: string, readOnly: boolean, },
  hiddenSupport?: {
    unstructuredJson: boolean,
    sharedRank: boolean,
  },
  columns: Array<{
    id: string,
    displayName: string,
    physicalName: string,
    storageType: string,
    nullable: boolean,
    defaultExpression: string | null,
    generatedExpression: string | null,
    identity: string,
    field: string,
    format: string,
    fieldConfig: Record<string, unknown>,
    formatConfig: Record<string, unknown>,
    validatorConfig?: ValidatorConfig,
    metadataVersion?: number,
    hidden: boolean,
    hiddenPurpose?: string,
    readOnly: boolean,
  }>,
  constraints: Array<{
    name: string,
    kind: string,
    columnIds: string[],
    targetFileId?: string,
    targetColumnIds?: string[],
    definition: string,
  }>,
};

//The expected ddl context contract exported for module callers
export type ExpectedDdlContext = {
  databaseOid: string,
  requestingRoleOid: string,
  requestingRoleName: string,
  identityGeneration?: number,
  mappingGeneration?: number,
  allowedRoleId?: string,
  roleGeneration?: number,
  ownerRoleOid?: string,
  ownerRoleName?: string,
  ddlFingerprint?: string,
  targetDdlFingerprint?: string,
  physicalNameOverridden?: boolean,
  fileMetadataVersion?: number | null,
  columnMetadataVersions?: Record<string, number | null>,
  schemaId?: string,
  namespaceOid?: string,
  schemaName?: string,
  fileId?: string,
  relationOid?: string,
  relationName?: string,
  targetFileId?: string,
  targetRelationOid?: string,
  targetSchemaName?: string,
  targetRelationName?: string,
  columnIds?: string[],
  columnAttributeNumbers?: number[],
  targetColumnIds?: string[],
  targetColumnAttributeNumbers?: number[],
  managedConstraints?: Array<{
    oid: string,
    name: string,
    kind: 'unique',
  }>,
};

//The native file ddl effect contract exported for module callers
export type NativeFileDdlEffect = {
  actionType: FileDdlAction['type'],
  relationOid?: string,
  physicalName?: string,
  createdConstraintName?: string,
  targetColumnPhysicalName?: string,
  hiddenPurpose?: 'row-id' | 'unstructured-json' | 'shared-rank',
  beforeFingerprint?: string,
};

//The stored file ddl request contract exported for module callers
export type StoredFileDdlRequest = {
  id: string,
  command_id: string,
  actor_identity_id: string,
  session_id: string,
  history_scope_id: string,
  connection_id: string,
  database_oid: string,
  requesting_role_oid: string,
  requesting_role_name: string,
  identity_generation: number,
  mapping_generation: number,
  allowed_role_id: string,
  role_generation: number,
  action_type: FileDdlAction['type'],
  request_digest: string,
  action_payload: FileDdlAction,
  expected_context: ExpectedDdlContext,
  confirmation_hash: string,
  state: 'planned' | 'confirmed' | 'applied',
  result_summary: AppliedFileDdl | null,
  expires_at: Date | string,
};
