import type { CapabilityAction } from '../../capability/helpers/contracts.js';
import { McpAuthorizedExecutionContext } from '../../capability/helpers/contracts.js';

const verifiedMcpPrincipalBrand: unique symbol = Symbol('verified-mcp-principal');

export const MCP_SERVICE = 'tabular.mcp';
export const MCP_CONTRACT_VERSION = '1.0.0' as const;
export const MCP_FRONTEND_RESOURCE_TEMPLATE = 'tabular://frontend-contract/v1/{fileId}';

export const MCP_CAPABILITY_ACTIONS = {
  tabular_record_read: 'record.read',
  tabular_record_patch: 'record.patch',
  tabular_record_insert: 'record.insert',
  tabular_record_delete: 'record.delete',
  tabular_range_patch: 'range.patch',
  tabular_draft_create: 'draft.create',
  tabular_draft_read: 'draft.read',
  tabular_draft_list: 'draft.list',
  tabular_draft_update: 'draft.update',
  tabular_draft_delete: 'draft.delete',
  tabular_draft_promote: 'draft.promote',
  tabular_history_list: 'history.list',
  tabular_history_undo: 'history.undo',
  tabular_history_redo: 'history.redo'
} as const satisfies Record<string, CapabilityAction['type']>;

export type McpCapabilityToolName = keyof typeof MCP_CAPABILITY_ACTIONS;
export type McpToolName =
  | 'get_frontend_contract'
  | 'tabular_list_files'
  | 'tabular_records_query'
  | McpCapabilityToolName;

export type McpTransportRequest =
  | { kind: 'tool'; name: McpToolName }
  | { kind: 'resource'; uri: string };

export type VerifiedMcpPrincipal = {
  readonly identityId: string;
  readonly sessionId: string;
  readonly historyScopeId: string;
  readonly connectionId: string;
  readonly expiresAt: Date;
  readonly scopes: {
    readonly tools: readonly McpToolName[];
    readonly resources: readonly 'tabular_frontend_contract'[];
  };
  readonly [verifiedMcpPrincipalBrand]: true;
};

/** Provider-neutral credential verification seam. Only a trusted installed
 * adapter can brand the principal accepted by the MCP service. */
export abstract class McpCredentialVerifier<Credential> {
  abstract verify(credential: Credential): Promise<VerifiedMcpPrincipal>;

  protected verifiedPrincipal(input: Omit<
    VerifiedMcpPrincipal,
    typeof verifiedMcpPrincipalBrand
  >): VerifiedMcpPrincipal {
    if (!/^id_[A-Za-z0-9_-]{32,64}$/.test(input.identityId)
      || !/^mcp_[A-Za-z0-9_-]{32,96}$/.test(input.sessionId)
      || !/^hist_[A-Za-z0-9_-]{32,64}$/.test(input.historyScopeId)
      || !/^[a-z][a-z0-9_-]{0,62}$/.test(input.connectionId)) {
      throw new Error('The verified MCP principal is invalid');
    }
    const expiresAt = new Date(input.expiresAt);
    const remaining = expiresAt.getTime() - Date.now();
    if (!Number.isFinite(expiresAt.getTime()) || remaining <= 0 || remaining > 86_400_000) {
      throw new Error('The verified MCP principal expiry is invalid');
    }
    const tools = [...input.scopes.tools];
    if (
      tools.length < 1
      || new Set(tools).size !== tools.length
      || tools.some((tool) => !mcpToolNames.has(tool))
      || input.scopes.resources.length > 1
      || new Set(input.scopes.resources).size !== input.scopes.resources.length
      || input.scopes.resources.some((resource) => resource !== 'tabular_frontend_contract')
    ) {
      throw new Error('The verified MCP principal scope is invalid');
    }
    return Object.freeze({
      identityId: input.identityId,
      sessionId: input.sessionId,
      historyScopeId: input.historyScopeId,
      connectionId: input.connectionId,
      expiresAt,
      scopes: Object.freeze({
        tools: Object.freeze(tools),
        resources: Object.freeze([...input.scopes.resources])
      }),
      [verifiedMcpPrincipalBrand]: true as const
    });
  }
}

export function assertVerifiedMcpPrincipal(
  value: VerifiedMcpPrincipal
): asserts value is VerifiedMcpPrincipal {
  if (!value || value[verifiedMcpPrincipalBrand] !== true) {
    throw new Error('The MCP principal was not verified by a registered adapter');
  }
}

/**
 * Only the trusted MCP identity/transport issuer may construct this context.
 * The transport policy is checked independently before the shared capability
 * kernel applies its action policy and PostgreSQL effective-role boundary.
 */
export abstract class GovernedMcpExecutionContext extends McpAuthorizedExecutionContext {
  abstract allowsMcp(request: McpTransportRequest): boolean;
}

export type McpToolCall = {
  name: McpToolName;
  arguments: Record<string, unknown>;
};

export type McpCallOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type McpSafeError = {
  category: string;
  description: string;
  canRetry: boolean;
  issues?: Array<{ columnId?: string; code: string; message: string }>;
};

export type McpToolResponse =
  | {
    isError: false;
    content: [{ type: 'text'; text: string }];
    structuredContent: { result: unknown };
  }
  | {
    isError: true;
    content: [{ type: 'text'; text: string }];
    structuredContent: { error: McpSafeError };
  };

export type McpResourceResponse =
  | {
    isError: false;
    contents: [{ uri: string; mimeType: 'application/json'; text: string }];
    structuredContent: { resource: McpFrontendContract };
  }
  | {
    isError: true;
    contents: [];
    structuredContent: { error: McpSafeError };
  };

export type McpFrontendContract = {
  contractVersion: typeof MCP_CONTRACT_VERSION;
  fileId: string;
  schemaVersion: string;
  columns: Array<{
    columnId: string;
    label: string;
    valueType: 'text' | 'integer' | 'decimal' | 'boolean' | 'date'
      | 'time' | 'timestamp' | 'json';
    fieldKind: string;
    formatKind: string;
    fieldConfig: Record<string, unknown>;
    formatConfig: Record<string, unknown>;
    editable: boolean;
    key: boolean;
    generated: boolean;
  }>;
  query: {
    filterOperators: ['=', '!=', 'like', '<', '<=', '>', '>='];
    sortDirections: ['asc', 'desc'];
    maximumRows: 100;
  };
  savedViewSchemaVersion: 1;
  bounds: {
    maximumReadColumns: 200;
    maximumQueryColumns: 200;
    maximumQueryCells: 10_000;
    maximumPatchCells: 1_000;
    maximumRangeCells: 10_000;
    maximumHistoryEntries: 100;
  };
  operations: McpToolName[];
  concurrency: {
    expectedVersion: true;
    silentOverwrite: false;
    requiredFields: {
      recordPatch: ['expectedVersion'];
      recordDelete: ['expectedVersion'];
      rangePatchRows: ['expectedVersion'];
      draftUpdate: ['expectedDraftVersion'];
      draftDelete: ['expectedDraftVersion'];
      draftPromote: ['expectedDraftVersion'];
    };
    conditionalRequiredFields: {
      draftPromoteExistingRow: ['expectedRowVersion'];
    };
  };
  arbitrarySql: false;
  arbitraryDdl: false;
};

export type McpJsonSchema = {
  type?: string;
  description?: string;
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  enum?: readonly unknown[];
  properties?: Record<string, McpJsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: McpJsonSchema;
  oneOf?: readonly McpJsonSchema[];
};

export type McpToolDefinition = {
  name: McpToolName;
  description: string;
  inputSchema: McpJsonSchema;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
  };
};

const fileId = text('^obj_[A-Za-z0-9_-]{32,64}$');
const rowId = text('^row_[A-Za-z0-9_-]{1,256}$');
const columnId = text('^col_[A-Za-z0-9_-]{32,64}$');
const commandId = text('^cmd_[A-Za-z0-9_-]{8,96}$');
const draftId = text('^draft_[A-Za-z0-9_-]{32,64}$');
const rowVersion = text('^ver_[A-Za-z0-9_-]{16,128}$');
const schemaVersion = text('^[a-f0-9]{64}$');
const cursor = text('^[A-Za-z0-9_-]{1,512}$');
const typedValue: McpJsonSchema = {
  oneOf: [
    object({ type: enumeration(['null']) }, ['type']),
    ...(['text', 'integer', 'decimal', 'date', 'time', 'timestamp', 'json'] as const)
      .map((type) => object({ type: enumeration([type]), value: { type: 'string' } }, ['type', 'value'])),
    object({ type: enumeration(['boolean']), value: { type: 'boolean' } }, ['type', 'value'])
  ]
};
const patch = array(object({ columnId, value: typedValue }, ['columnId', 'value']), 1, 1_000);
const optionalPatch = array(object({ columnId, value: typedValue }, ['columnId', 'value']), 0, 1_000);

export const MCP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  tool('get_frontend_contract', 'Read the authorized, versioned frontend contract for one file.',
    object({ contractVersion: integer(1, 1), fileId }, ['contractVersion', 'fileId']), true, false, true),
  tool('tabular_list_files', 'List caller-visible files using a stable opaque cursor.', object({
    cursor,
    limit: integer(1, 100)
  }, ['limit']), true, false, true),
  tool('tabular_records_query', 'Read a bounded authorized row collection through the shared query compiler.',
    object({
      fileId,
      columnIds: array(columnId, 1, 200, true),
      filters: array(object({
        columnId,
        operation: enumeration(['=', '!=', 'like', '<', '<=', '>', '>=']),
        value: { oneOf: [
          { type: 'null' }, { type: 'string' }, { type: 'number' }, { type: 'boolean' }
        ] }
      }, ['columnId', 'operation', 'value']), 0, 32),
      sorts: array(object({
        columnId,
        direction: enumeration(['asc', 'desc'])
      }, ['columnId', 'direction']), 0, 16),
      limit: integer(1, 100)
    }, ['fileId', 'columnIds', 'filters', 'sorts', 'limit']), true, false, true),
  tool('tabular_record_read', 'Read allowlisted columns from one authorized record.',
    object({ fileId, rowId, columnIds: array(columnId, 1, 200, true) }, ['fileId', 'rowId', 'columnIds']),
    true, false, true),
  tool('tabular_record_patch', 'Apply one expected-version record patch.',
    object({ commandId, fileId, rowId, expectedVersion: rowVersion, patch },
      ['commandId', 'fileId', 'rowId', 'expectedVersion', 'patch']), false, false, true),
  tool('tabular_record_insert', 'Insert one record through the shared action journal.',
    object({ commandId, fileId, patch }, ['commandId', 'fileId', 'patch']), false, false, true),
  tool('tabular_record_delete', 'Delete one expected-version record.',
    object({ commandId, fileId, rowId, expectedVersion: rowVersion },
      ['commandId', 'fileId', 'rowId', 'expectedVersion']), false, true, true),
  tool('tabular_range_patch', 'Apply one atomic bounded range patch.',
    object({
      commandId,
      fileId,
      cellCount: integer(1, 10_000),
      rows: array(object({ rowId, expectedVersion: rowVersion, patch },
        ['rowId', 'expectedVersion', 'patch']), 1, 10_000)
    }, ['commandId', 'fileId', 'cellCount', 'rows']), false, false, true),
  tool('tabular_draft_create', 'Create a bounded typed draft.', object({
    commandId, fileId, rowId, schemaVersion, patch: optionalPatch,
    expiresAt: { type: 'string', format: 'date-time' }
  }, ['commandId', 'fileId', 'schemaVersion', 'patch', 'expiresAt']), false, false, true),
  tool('tabular_draft_read', 'Read one caller-authorized draft.',
    object({ draftId }, ['draftId']), true, false, true),
  tool('tabular_draft_list', 'List active drafts for one caller-authorized file.',
    object({ fileId }, ['fileId']), true, false, true),
  tool('tabular_draft_update', 'Update one expected-version draft.', object({
    commandId, draftId, expectedDraftVersion: integer(1), patch: optionalPatch
  }, ['commandId', 'draftId', 'expectedDraftVersion', 'patch']), false, false, true),
  tool('tabular_draft_delete', 'Abandon one expected-version draft.', object({
    commandId, draftId, expectedDraftVersion: integer(1)
  }, ['commandId', 'draftId', 'expectedDraftVersion']), false, true, true),
  tool('tabular_draft_promote', 'Promote one validated expected-version draft.', object({
    commandId, draftId, expectedDraftVersion: integer(1), expectedRowVersion: rowVersion
  }, ['commandId', 'draftId', 'expectedDraftVersion']), false, false, true),
  tool('tabular_history_list', 'Read bounded action history for one file.', object({
    fileId, limit: integer(1, 100)
  }, ['fileId', 'limit']), true, false, true),
  tool('tabular_history_undo', 'Undo the latest reversible action in scope.',
    object({ commandId, fileId }, ['commandId']), false, true, true),
  tool('tabular_history_redo', 'Redo the latest reversible action in scope.',
    object({ commandId, fileId }, ['commandId']), false, false, true)
] as const;

export const MCP_RESOURCE_TEMPLATES = [{
  uriTemplate: MCP_FRONTEND_RESOURCE_TEMPLATE,
  name: 'tabular_frontend_contract',
  description: 'Caller-authorized frontend contract for one Tabular file.',
  mimeType: 'application/json' as const
}] as const;

const mcpToolNames = new Set<McpToolName>(
  MCP_TOOL_DEFINITIONS.map((definition) => definition.name)
);

function tool(
  name: McpToolName,
  description: string,
  inputSchema: McpJsonSchema,
  readOnlyHint = false,
  destructiveHint = false,
  idempotentHint = false
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema,
    annotations: { readOnlyHint, destructiveHint, idempotentHint }
  };
}

function object(properties: Record<string, McpJsonSchema>, required: string[]): McpJsonSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

function text(pattern: string): McpJsonSchema {
  return { type: 'string', pattern };
}

function integer(minimum: number, maximum?: number): McpJsonSchema {
  return { type: 'integer', minimum, ...(maximum ? { maximum } : {}) };
}

function enumeration(values: readonly unknown[]): McpJsonSchema {
  return { enum: values };
}

function array(
  items: McpJsonSchema,
  minItems: number,
  maxItems: number,
  uniqueItems = false
): McpJsonSchema {
  return { type: 'array', items, minItems, maxItems, ...(uniqueItems ? { uniqueItems } : {}) };
}
