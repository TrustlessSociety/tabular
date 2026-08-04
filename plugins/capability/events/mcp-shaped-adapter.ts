import type {
  CapabilityAction,
  McpAuthorizedExecutionContext as McpAuthorityType
} from '../helpers/contracts.js';
import { McpAuthorizedExecutionContext } from '../helpers/contracts.js';
import type { CapabilityPluginService } from '../helpers/service.js';

const toolActions = {
  tabular_record_read: 'record.read',
  tabular_record_patch: 'record.patch',
  tabular_record_insert: 'record.insert',
  tabular_record_delete: 'record.delete',
  tabular_range_patch: 'range.patch',
  tabular_draft_create: 'draft.create',
  tabular_draft_read: 'draft.read',
  tabular_draft_update: 'draft.update',
  tabular_draft_delete: 'draft.delete',
  tabular_draft_promote: 'draft.promote',
  tabular_history_list: 'history.list',
  tabular_history_undo: 'history.undo',
  tabular_history_redo: 'history.redo'
} as const satisfies Record<string, CapabilityAction['type']>;

type ToolName = keyof typeof toolActions;

export type McpShapedResponse =
  | { isError: false; structuredContent: { result: unknown } }
  | {
    isError: true;
    structuredContent: {
      error: { category: string; description: string; canRetry: boolean };
    };
  };

export class McpShapedCapabilityAdapter {
  constructor(private readonly capability: CapabilityPluginService) {}

  async invoke(
    authority: McpAuthorityType,
    request: unknown
  ): Promise<McpShapedResponse> {
    if (!(authority instanceof McpAuthorizedExecutionContext) || authority.surface !== 'mcp') {
      return invalidMcpAction('capability_denied', 'The requested capability is denied');
    }
    let envelope: ReturnType<typeof toolEnvelope>;
    try {
      envelope = toolEnvelope(request);
    } catch {
      return invalidMcpAction('invalid_action', 'The action is invalid');
    }
    const action = {
      ...envelope.arguments,
      type: toolActions[envelope.tool]
    } as CapabilityAction;
    const result = await this.capability.execute(authority, action);
    if (result.ok) {
      return { isError: false, structuredContent: { result: result.value } };
    }
    return {
      isError: true,
      structuredContent: {
        error: {
          category: result.error.code,
          description: result.error.message,
          canRetry: result.error.retryable
        }
      }
    };
  }
}

function invalidMcpAction(category: string, description: string): McpShapedResponse {
  return {
    isError: true,
    structuredContent: {
      error: { category, description, canRetry: false }
    }
  };
}

function toolEnvelope(input: unknown): {
  tool: ToolName;
  arguments: Record<string, unknown>;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The MCP-shaped request is invalid');
  }
  const record = input as Record<string, unknown>;
  if (
    Object.keys(record).some((key) => !['tool', 'arguments'].includes(key))
    || typeof record.tool !== 'string'
    || !(record.tool in toolActions)
    || !record.arguments
    || typeof record.arguments !== 'object'
    || Array.isArray(record.arguments)
  ) {
    throw new Error('The MCP-shaped request is invalid');
  }
  const argumentsRecord = record.arguments as Record<string, unknown>;
  for (const forbidden of [
    'type',
    'role', 'identityId', 'sessionId', 'historyScopeId', 'connectionId',
    'sql', 'ddl', 'schemaName', 'tableName', 'cookie', 'csrfToken'
  ]) {
    if (forbidden in argumentsRecord) throw new Error('The MCP-shaped request contains authority data');
  }
  return { tool: record.tool as ToolName, arguments: argumentsRecord };
}
