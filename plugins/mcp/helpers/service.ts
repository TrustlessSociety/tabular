import { ApplicationError } from '../../../bootstrap/errors.js';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import {
  ActionFault,
  CapabilityResultBudgetExceededError,
  type CapabilityAction
} from '../../capability/helpers/contracts.js';
import type {
  CapabilityPluginService,
  GridTargetPlan
} from '../../capability/helpers/service.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import { discoverCallerCatalog } from '../../catalog/helpers/discovery.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import type { StableCatalogSnapshot } from '../../catalog/helpers/contracts.js';
import {
  MCP_CAPABILITY_ACTIONS,
  MCP_CONTRACT_VERSION,
  MCP_RESOURCE_TEMPLATES,
  MCP_SERVICE,
  MCP_TOOL_DEFINITIONS,
  assertVerifiedMcpPrincipal,
  type McpCredentialVerifier,
  type McpCallOptions,
  type McpFrontendContract,
  type McpResourceResponse,
  type McpSafeError,
  type McpToolName,
  type McpToolResponse,
  type VerifiedMcpPrincipal
} from './contracts.js';
import {
  WebPoolGovernedMcpAuthority,
  type McpExecutionBoundary
} from './authority.js';
import {
  validateListFilesArguments,
  validateQueryRowsArguments,
  validateResourceRequest,
  validateToolCall
} from './validation.js';

type FrontendColumnMetadata = {
  column_id: string;
  display_name: string;
  field_kind: string;
  format_kind: string;
  field_config: unknown;
  format_config: unknown;
};

const MAX_MCP_RESULT_BYTES = 1_048_576;
const MAX_MCP_ISSUES = 100;
const MAX_MCP_DATABASE_VALUE_BYTES = 262_144;

type McpExecutionLease = McpExecutionBoundary & {
  close(): void;
};

class McpLifecycleFault extends Error {
  constructor(readonly safe: McpSafeError) {
    super(safe.description);
    this.name = 'McpLifecycleFault';
  }
}

export class McpPluginService {
  readonly name = MCP_SERVICE;
  readonly #activeExecutions = new Set<AbortController>();
  #draining = false;

  constructor(
    private readonly runtime: ApplicationRuntimeService,
    private readonly database: DatabasePluginService,
    private readonly capability: CapabilityPluginService,
    private readonly catalog: {
      reconcile: typeof reconcileCatalog;
      discover: typeof discoverCallerCatalog;
    } = {
      reconcile: reconcileCatalog,
      discover: discoverCallerCatalog
    }
  ) {}

  async verifyCredential<Credential>(
    verifier: McpCredentialVerifier<Credential>,
    credential: Credential
  ) {
    if (!verifier || typeof verifier.verify !== 'function') {
      throw new Error('A registered MCP credential verifier is required');
    }
    const principal = await verifier.verify(credential);
    assertVerifiedMcpPrincipal(principal);
    if (
      this.runtime.processKind !== 'web'
      || principal.connectionId !== this.runtime.config.database.connectionId
    ) {
      throw new ApplicationError('capability_denied', 403, 'The requested capability is denied');
    }
    return principal;
  }

  tools(principal: VerifiedMcpPrincipal) {
    this.#validatePrincipal(principal);
    return structuredClone(MCP_TOOL_DEFINITIONS.filter((definition) =>
      principal.scopes.tools.includes(definition.name)));
  }

  resourceTemplates(principal: VerifiedMcpPrincipal) {
    this.#validatePrincipal(principal);
    return principal.scopes.resources.includes('tabular_frontend_contract')
      ? structuredClone(MCP_RESOURCE_TEMPLATES)
      : [];
  }

  ready() {
    return !this.#draining;
  }

  beginDrain() {
    this.#draining = true;
    for (const controller of this.#activeExecutions) controller.abort();
  }

  async close() {
    if (this.#draining && this.#activeExecutions.size === 0) return;
    this.beginDrain();
    const deadline = Date.now() + this.runtime.config.server.shutdownTimeoutMs;
    while (this.#activeExecutions.size > 0) {
      if (Date.now() >= deadline) {
        throw new Error('Timed out draining MCP calls');
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  async callTool(
    principal: VerifiedMcpPrincipal,
    input: unknown,
    options: McpCallOptions = {}
  ): Promise<McpToolResponse> {
    let call: ReturnType<typeof validateToolCall>;
    try {
      call = validateToolCall(input);
    } catch {
      return toolFailure(invalidError());
    }

    let execution: McpExecutionLease;
    try {
      this.#validatePrincipal(principal);
      execution = this.#beginExecution(options);
    } catch (error) {
      return toolFailure(lifecycleOrDeniedError(error));
    }
    try {
      return await this.#callTool(principal, execution, call);
    } finally {
      execution.close();
    }
  }

  async #callTool(
    principal: VerifiedMcpPrincipal,
    execution: McpExecutionLease,
    call: ReturnType<typeof validateToolCall>
  ): Promise<McpToolResponse> {
    const authority = this.#authority(principal, execution);
    if (!authority.allowsMcp({ kind: 'tool', name: call.name })) {
      return toolFailure(deniedError());
    }
    if (execution.signal.aborted) return toolFailure(executionError(execution));

    if (call.name === 'get_frontend_contract') {
      try {
        return toolSuccess(await this.#frontendContract(
          authority,
          call.arguments.fileId as string,
          principal.scopes.tools
        ));
      } catch (error) {
        return toolFailure(safeError(error, authority));
      }
    }
    if (call.name === 'tabular_list_files') {
      let argumentsInput: ReturnType<typeof validateListFilesArguments>;
      try {
        argumentsInput = validateListFilesArguments(call.arguments);
      } catch {
        return toolFailure(invalidError());
      }
      try {
        return toolSuccess(await this.#listFiles(authority, argumentsInput));
      } catch (error) {
        return toolFailure(safeError(error, authority));
      }
    }
    if (call.name === 'tabular_records_query') {
      let argumentsInput: ReturnType<typeof validateQueryRowsArguments>;
      try {
        argumentsInput = validateQueryRowsArguments(call.arguments);
      } catch {
        return toolFailure(invalidError());
      }
      try {
        return toolSuccess(await this.#queryRows(authority, argumentsInput));
      } catch (error) {
        return toolFailure(safeError(error, authority));
      }
    }

    const action = {
      ...call.arguments,
      type: MCP_CAPABILITY_ACTIONS[call.name]
    } as CapabilityAction;
    const result = await this.capability.execute(authority, action, {
      maximumResultBytes: MAX_MCP_DATABASE_VALUE_BYTES
    });
    if (!result.ok && authority.transactionCancelled) {
      return toolFailure(executionError(authority));
    }
    return result.ok ? toolSuccess(result.value) : toolFailure({
      category: result.error.code,
      description: result.error.message,
      canRetry: result.error.retryable,
      ...(result.error.issues ? { issues: result.error.issues } : {})
    });
  }

  async readResource(
    principal: VerifiedMcpPrincipal,
    input: unknown,
    options: McpCallOptions = {}
  ): Promise<McpResourceResponse> {
    let request: ReturnType<typeof validateResourceRequest>;
    try {
      request = validateResourceRequest(input);
    } catch {
      return resourceFailure(invalidError());
    }

    let execution: McpExecutionLease;
    try {
      this.#validatePrincipal(principal);
      execution = this.#beginExecution(options);
    } catch (error) {
      return resourceFailure(lifecycleOrDeniedError(error));
    }
    try {
      return await this.#readResource(principal, execution, request);
    } finally {
      execution.close();
    }
  }

  async #readResource(
    principal: VerifiedMcpPrincipal,
    execution: McpExecutionLease,
    request: ReturnType<typeof validateResourceRequest>
  ): Promise<McpResourceResponse> {
    const authority = this.#authority(principal, execution);
    if (!authority.allowsMcp({ kind: 'resource', uri: request.uri })) {
      return resourceFailure(deniedError());
    }
    if (execution.signal.aborted) return resourceFailure(executionError(execution));

    try {
      const resource = await this.#frontendContract(
        authority,
        request.fileId,
        principal.scopes.tools
      );
      return resourceSuccess(request.uri, resource);
    } catch (error) {
      return resourceFailure(safeError(error, authority));
    }
  }

  #validatePrincipal(principal: VerifiedMcpPrincipal) {
    assertVerifiedMcpPrincipal(principal);
    if (
      this.runtime.processKind !== 'web'
      || principal.connectionId !== this.runtime.config.database.connectionId
      || principal.expiresAt.getTime() <= Date.now()
    ) {
      throw new ApplicationError('capability_denied', 403, 'The requested capability is denied');
    }
  }

  #authority(principal: VerifiedMcpPrincipal, execution: McpExecutionBoundary) {
    this.#validatePrincipal(principal);
    return new WebPoolGovernedMcpAuthority(this.database, principal, execution);
  }

  #beginExecution(options: McpCallOptions): McpExecutionLease {
    if (this.#draining) throw new McpLifecycleFault(drainingError());
    const maximum = Math.max(1, this.runtime.config.database.poolMaximum - 1);
    if (this.#activeExecutions.size >= maximum) {
      throw new McpLifecycleFault(capacityError());
    }
    if (
      typeof options !== 'object'
      || options === null
      || (options.timeoutMs !== undefined
        && (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1))
      || (options.signal !== undefined
        && (typeof options.signal !== 'object'
          || typeof options.signal.addEventListener !== 'function'))
    ) {
      throw new McpLifecycleFault(invalidError());
    }
    const timeoutMs = Math.min(
      options.timeoutMs ?? this.runtime.config.server.requestTimeoutMs,
      this.runtime.config.server.requestTimeoutMs,
      this.runtime.config.database.statementTimeoutMs
    );
    const controller = new AbortController();
    let deadlineExceeded = false;
    let closed = false;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(() => {
      deadlineExceeded = true;
      controller.abort();
    }, timeoutMs);
    timer.unref?.();
    this.#activeExecutions.add(controller);
    return {
      signal: controller.signal,
      timeoutMs,
      deadlineExceeded: () => deadlineExceeded,
      close: () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        this.#activeExecutions.delete(controller);
      }
    };
  }

  async #frontendContract(
    authority: WebPoolGovernedMcpAuthority,
    fileId: string,
    tools: readonly McpToolName[]
  ): Promise<McpFrontendContract> {
    let plan: GridTargetPlan | undefined;
    let metadata = new Map<string, FrontendColumnMetadata>();
    return authority.readTransaction({
      prepareBase: async (database) => {
        plan = await this.capability.prepareGridTarget(
          database,
          fileId,
          authority.connectionId
        );
        const configured = await database.execute<FrontendColumnMetadata>(`
          SELECT column_id, display_name, field_kind, format_kind,
                 field_config, format_config
            FROM tabular.column_metadata
           WHERE object_id = ? AND NOT hidden
           ORDER BY created_at, column_id
        `, [fileId]);
        metadata = new Map(configured.rows.map((column) => [column.column_id, column]));
      },
      target: async (database) => {
        if (!plan) {
          throw new ActionFault({
            code: 'not_found',
            message: 'The requested resource is unavailable',
            retryable: false
          });
        }
        const snapshot = await this.capability.describeGridTarget(database, plan);
        return {
          contractVersion: MCP_CONTRACT_VERSION,
          fileId: snapshot.fileId,
          schemaVersion: snapshot.schemaVersion,
          columns: snapshot.columns.map((column) => {
            const presentation = metadata.get(column.columnId);
            return {
              columnId: column.columnId,
              label: presentation?.display_name || column.columnId,
              valueType: column.codec,
              fieldKind: presentation?.field_kind || column.codec,
              formatKind: presentation?.format_kind || 'plain-text',
              fieldConfig: safeObject(presentation?.field_config),
              formatConfig: safeObject(presentation?.format_config),
              editable: column.editable,
              key: column.key,
              generated: column.generated
            };
          }),
          query: {
            filterOperators: ['=', '!=', 'like', '<', '<=', '>', '>='],
            sortDirections: ['asc', 'desc'],
            maximumRows: 100
          },
          savedViewSchemaVersion: 1,
          bounds: {
            maximumReadColumns: 200,
            maximumQueryColumns: 200,
            maximumQueryCells: 10_000,
            maximumPatchCells: 1_000,
            maximumRangeCells: 10_000,
            maximumHistoryEntries: 100
          },
          operations: frontendOperations(tools, snapshot.operations),
          concurrency: {
            expectedVersion: true,
            silentOverwrite: false,
            requiredFields: {
              recordPatch: ['expectedVersion'],
              recordDelete: ['expectedVersion'],
              rangePatchRows: ['expectedVersion'],
              draftUpdate: ['expectedDraftVersion'],
              draftDelete: ['expectedDraftVersion'],
              draftPromote: ['expectedDraftVersion']
            },
            conditionalRequiredFields: {
              draftPromoteExistingRow: ['expectedRowVersion']
            }
          },
          arbitrarySql: false,
          arbitraryDdl: false
        };
      }
    });
  }

  async #listFiles(
    authority: WebPoolGovernedMcpAuthority,
    input: { cursor?: string; limit: number }
  ) {
    let stable: StableCatalogSnapshot | undefined;
    return authority.readTransaction({
      prepareBase: async (database) => {
        stable = await this.catalog.reconcile(database, authority.connectionId);
      },
      target: async (database) => {
        if (!stable) throw new Error('Catalog reconciliation did not run');
        const catalog = await this.catalog.discover(database, stable);
        const files = catalog.schemas.flatMap((schema) => schema.files.map((file) => ({
          schema: { schemaId: schema.id, name: schema.name },
          file: {
            fileId: file.id,
            name: file.name,
            kind: file.kind,
            readOnly: file.readOnly
          }
        }))).sort((left, right) => `${left.schema.schemaId}:${left.file.fileId}`
          .localeCompare(`${right.schema.schemaId}:${right.file.fileId}`));
        const after = input.cursor ? decodeCursor(input.cursor) : undefined;
        const nextIndex = after
          ? files.findIndex((entry) => discoveryKey(
            entry.schema.schemaId,
            entry.file.fileId
          ).localeCompare(after) > 0)
          : 0;
        const start = nextIndex < 0 ? files.length : nextIndex;
        const items = files.slice(start, start + input.limit);
        const hasMore = start + items.length < files.length;
        return {
          items,
          ...(hasMore && items.length
            ? { nextCursor: encodeCursor(
              items.at(-1)!.schema.schemaId,
              items.at(-1)!.file.fileId
            ) }
            : {})
        };
      }
    });
  }

  async #queryRows(
    authority: WebPoolGovernedMcpAuthority,
    input: ReturnType<typeof validateQueryRowsArguments>
  ) {
    let plan: GridTargetPlan | undefined;
    return authority.readTransaction({
      prepareBase: async (database) => {
        plan = await this.capability.prepareGridTarget(
          database,
          input.fileId,
          authority.connectionId
        );
      },
      target: async (database) => {
        if (!plan) {
          throw new ActionFault({
            code: 'not_found',
            message: 'The requested resource is unavailable',
            retryable: false
          });
        }
        const result = await this.capability.queryGridTarget(database, plan, {
          ...input,
          maximumResultBytes: MAX_MCP_DATABASE_VALUE_BYTES
        });
        return {
          fileId: result.fileId,
          schemaVersion: result.schemaVersion,
          columns: result.columns.map((column) => ({
            columnId: column.columnId,
            valueType: column.codec,
            editable: column.editable,
            key: column.key,
            generated: column.generated
          })),
          rows: result.rows,
          truncated: Boolean(result.truncated)
        };
      }
    });
  }
}

function toolSuccess(result: unknown): McpToolResponse {
  const serialized = JSON.stringify(result);
  const response: McpToolResponse = {
    isError: false,
    content: [{ type: 'text', text: serialized }],
    structuredContent: { result }
  };
  return responseBytes(response) <= MAX_MCP_RESULT_BYTES
    ? response
    : toolFailure(resultTooLargeError());
}

function resourceSuccess(uri: string, resource: McpFrontendContract): McpResourceResponse {
  const serialized = JSON.stringify(resource);
  const response: McpResourceResponse = {
    isError: false,
    contents: [{ uri, mimeType: 'application/json', text: serialized }],
    structuredContent: { resource }
  };
  return responseBytes(response) <= MAX_MCP_RESULT_BYTES
    ? response
    : resourceFailure(resultTooLargeError());
}

function toolFailure(error: McpSafeError): McpToolResponse {
  const bounded = boundedError(error);
  const response: McpToolResponse = {
    isError: true,
    content: [{ type: 'text', text: bounded.description }],
    structuredContent: { error: bounded }
  };
  if (responseBytes(response) <= MAX_MCP_RESULT_BYTES) return response;
  if (bounded.category === 'result_too_large') return {
    isError: true,
    content: [{ type: 'text', text: 'The MCP result is too large' }],
    structuredContent: { error: resultTooLargeError() }
  };
  return toolFailure(resultTooLargeError());
}

function resourceFailure(error: McpSafeError): McpResourceResponse {
  const bounded = boundedError(error);
  const response: McpResourceResponse = {
    isError: true,
    contents: [],
    structuredContent: { error: bounded }
  };
  return responseBytes(response) <= MAX_MCP_RESULT_BYTES
    ? response
    : resourceFailure(resultTooLargeError());
}

function boundedError(error: McpSafeError): McpSafeError {
  return {
    category: String(error.category).slice(0, 80),
    description: String(error.description).slice(0, 1_000),
    canRetry: Boolean(error.canRetry),
    ...(error.issues?.length ? {
      issues: error.issues.slice(0, MAX_MCP_ISSUES).map((issue) => ({
        ...(issue.columnId ? { columnId: String(issue.columnId).slice(0, 96) } : {}),
        code: String(issue.code).slice(0, 80),
        message: String(issue.message).slice(0, 500)
      }))
    } : {})
  };
}

function responseBytes(response: McpToolResponse | McpResourceResponse) {
  return Buffer.byteLength(JSON.stringify(response), 'utf8');
}

function invalidError(): McpSafeError {
  return {
    category: 'invalid_action',
    description: 'The MCP request is invalid',
    canRetry: false
  };
}

function deniedError(): McpSafeError {
  return {
    category: 'capability_denied',
    description: 'The requested capability is denied',
    canRetry: false
  };
}

function resultTooLargeError(): McpSafeError {
  return {
    category: 'result_too_large',
    description: 'The MCP result is too large; request a narrower result',
    canRetry: false
  };
}

function safeError(
  error: unknown,
  authority?: Pick<WebPoolGovernedMcpAuthority,
    'transactionCancelled' | 'transactionDeadlineExceeded'>
): McpSafeError {
  if (authority?.transactionCancelled || authority?.transactionDeadlineExceeded) {
    return executionError(authority);
  }
  if (error instanceof CapabilityResultBudgetExceededError) {
    return resultTooLargeError();
  }
  if (error instanceof ActionFault) {
    return {
      category: error.safe.code,
      description: error.safe.message,
      canRetry: error.safe.retryable,
      ...(error.safe.issues ? { issues: error.safe.issues } : {})
    };
  }
  if (
    error instanceof ApplicationError
    && (error.errorCode === 'capability_denied' || [401, 403].includes(error.statusCode))
  ) return deniedError();
  const code = postgresCode(error);
  if (code === '42501') return deniedError();
  if (code === '57014') return deadlineError();
  if (['40001', '40P01', '55P03'].includes(code)) {
    return {
      category: 'retryable_conflict',
      description: 'The action could not complete and may be retried',
      canRetry: true
    };
  }
  return {
    category: 'action_failed',
    description: 'The action could not be completed',
    canRetry: false
  };
}

function lifecycleOrDeniedError(error: unknown) {
  return error instanceof McpLifecycleFault ? error.safe : deniedError();
}

function executionError(execution: {
  deadlineExceeded(): boolean;
} | {
  transactionDeadlineExceeded: boolean;
}): McpSafeError {
  const exceeded = 'deadlineExceeded' in execution
    ? execution.deadlineExceeded()
    : execution.transactionDeadlineExceeded;
  return exceeded ? deadlineError() : {
    category: 'cancelled',
    description: 'The MCP request was cancelled',
    canRetry: false
  };
}

function deadlineError(): McpSafeError {
  return {
    category: 'deadline_exceeded',
    description: 'The MCP request deadline was exceeded',
    canRetry: true
  };
}

function drainingError(): McpSafeError {
  return {
    category: 'server_draining',
    description: 'The MCP service is draining',
    canRetry: true
  };
}

function capacityError(): McpSafeError {
  return {
    category: 'capacity_exhausted',
    description: 'The MCP service is at its concurrent-call limit',
    canRetry: true
  };
}

function postgresCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {};
}

function frontendOperations(
  tools: readonly McpToolName[],
  authority: { update: boolean; insert: boolean; delete: boolean }
) {
  const readTools = new Set<McpToolName>([
    'get_frontend_contract',
    'tabular_list_files',
    'tabular_records_query',
    'tabular_record_read',
    'tabular_history_list',
    'tabular_draft_read',
    'tabular_draft_list'
  ]);
  const updateTools = new Set<McpToolName>([
    'tabular_record_patch',
    'tabular_range_patch',
    'tabular_draft_create',
    'tabular_draft_update',
    'tabular_draft_delete',
    'tabular_draft_promote'
  ]);
  const reversibleTools = new Set<McpToolName>([
    'tabular_history_undo',
    'tabular_history_redo'
  ]);
  const canMutate = authority.update || authority.insert || authority.delete;
  return tools.filter((tool) => readTools.has(tool)
    || (authority.update && updateTools.has(tool))
    || (authority.insert && tool === 'tabular_record_insert')
    || (authority.delete && tool === 'tabular_record_delete')
    || (canMutate && reversibleTools.has(tool)));
}

function encodeCursor(schemaId: string, fileId: string) {
  return Buffer.from(JSON.stringify({ version: 1, schemaId, fileId }), 'utf8')
    .toString('base64url');
}

function decodeCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.version !== 1
      || typeof record.schemaId !== 'string'
      || !/^schema_[A-Za-z0-9_-]{32,64}$/.test(record.schemaId)
      || typeof record.fileId !== 'string'
      || !/^obj_[A-Za-z0-9_-]{32,64}$/.test(record.fileId)) throw new Error();
    return discoveryKey(record.schemaId, record.fileId);
  } catch {
    throw new ActionFault({
      code: 'invalid_action',
      message: 'The discovery cursor is invalid',
      retryable: false
    });
  }
}

function discoveryKey(schemaId: string, fileId: string) {
  return `${schemaId}:${fileId}`;
}
