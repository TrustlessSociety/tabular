import assert from 'node:assert/strict';
import test from 'node:test';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type { CapabilityAction } from '../../capability/helpers/contracts.js';
import type { CapabilityPluginService } from '../../capability/helpers/service.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import { GovernedMcpTransportAdapter } from '../events/adapter.js';
import {
  MCP_CONTRACT_VERSION,
  MCP_TOOL_DEFINITIONS,
  McpCredentialVerifier,
  type McpToolName
} from '../helpers/contracts.js';
import { McpPluginService } from '../helpers/service.js';
import {
  validateListFilesArguments,
  validateQueryRowsArguments,
  validateToolCall
} from '../helpers/validation.js';

const suffix = 'M'.repeat(32);
const fileId = `obj_${suffix}`;
const rowId = `row_${suffix}`;
const columnId = `col_${suffix}`;

class TestVerifier extends McpCredentialVerifier<string> {
  constructor(
    private readonly tools: McpToolName[],
    private readonly resources: 'tabular_frontend_contract'[] = []
  ) { super(); }

  async verify(credential: string) {
    if (credential !== 'verified-token') throw new Error('credential denied');
    return this.verifiedPrincipal({
      identityId: `id_${suffix}`,
      sessionId: `mcp_${suffix}`,
      historyScopeId: `hist_${suffix}`,
      connectionId: 'local',
      expiresAt: new Date(Date.now() + 60_000),
      scopes: { tools: this.tools, resources: this.resources }
    });
  }
}

test('MCP definitions are closed, bounded, unique, and expose no arbitrary SQL or DDL tool', () => {
  assert.equal(new Set(MCP_TOOL_DEFINITIONS.map((tool) => tool.name)).size,
    MCP_TOOL_DEFINITIONS.length);
  assert.ok(MCP_TOOL_DEFINITIONS.every((tool) =>
    tool.inputSchema.type === 'object' && tool.inputSchema.additionalProperties === false));
  assert.equal(schema('tabular_list_files', 'limit').maximum, 100);
  assert.equal(schema('tabular_records_query', 'limit').maximum, 100);
  assert.equal(schema('tabular_records_query', 'columnIds').maxItems, 200);
  assert.equal(schema('tabular_range_patch', 'cellCount').maximum, 10_000);
  assert.equal(MCP_TOOL_DEFINITIONS.some((tool) => /sql|ddl/i.test(tool.name)), false);
});

test('transport validation rejects authority, role, SQL, DDL, internal metadata, and unstable bounds', () => {
  for (const forbidden of [
    'authority', 'role', 'identityId', 'sessionId', 'connectionId',
    'sql', 'ddl', 'physicalName', 'internalMetadata', 'migrator'
  ]) {
    assert.throws(() => validateToolCall({
      name: 'tabular_record_read',
      arguments: { fileId, rowId, columnIds: [columnId], [forbidden]: 'forged' }
    }), /invalid/);
  }
  assert.throws(() => validateToolCall({
    name: 'tabular_unknown', arguments: {}
  }), /invalid/);
  assert.throws(() => validateListFilesArguments({ limit: 101 }), /invalid/);
  assert.throws(() => validateQueryRowsArguments({
    fileId,
    columnIds: [columnId],
    filters: [],
    sorts: [],
    limit: 1_001
  }), /invalid/);
  assert.throws(() => validateQueryRowsArguments({
    fileId,
    columnIds: [columnId],
    filters: [{ columnId, operation: 'raw', value: 'SELECT secret' }],
    sorts: [],
    limit: 10
  }), /invalid/);
});

test('verified transport scope delegates mutations to the shared kernel and denies forged principals', async () => {
  const captured: CapabilityAction[] = [];
  const capability = capabilityDouble({ captured });
  const service = serviceWith(capability);
  const verifier = new TestVerifier(['tabular_record_patch']);
  const transport = new GovernedMcpTransportAdapter(service, verifier);
  const input = {
    name: 'tabular_record_patch',
    arguments: {
      commandId: 'cmd_abcdefgh',
      fileId,
      rowId,
      expectedVersion: `ver_${'v'.repeat(16)}`,
      patch: [{ columnId, value: { type: 'text', value: 'accepted' } }]
    }
  };
  const response = await transport.callTool('verified-token', input);
  assert.equal(response.isError, false);
  assert.deepEqual(captured, [{ ...input.arguments, type: 'record.patch' }]);

  assert.equal((await transport.callTool('invalid-token', input)).isError, true);
  assert.deepEqual(await transport.listTools('verified-token').then((tools) =>
    tools.map((tool) => tool.name)), ['tabular_record_patch']);
  assert.deepEqual(await transport.listResourceTemplates('verified-token'), []);
  assert.equal(captured.length, 1);

  const forged = await service.callTool({
    identityId: `id_${suffix}`,
    sessionId: `mcp_${suffix}`,
    historyScopeId: `hist_${suffix}`,
    connectionId: 'local',
    expiresAt: new Date(Date.now() + 60_000),
    scopes: { tools: ['tabular_record_patch'], resources: [] }
  } as never, input);
  assert.equal(forged.isError, true);
  assert.equal(forged.structuredContent.error.category, 'capability_denied');
});

test('frontend contract and collection reads use the governed web transaction and redact physical metadata', async () => {
  const capability = capabilityDouble();
  const service = serviceWith(capability);
  const verifier = new TestVerifier([
    'get_frontend_contract',
    'tabular_list_files',
    'tabular_records_query'
  ], ['tabular_frontend_contract']);
  const principal = await service.verifyCredential(verifier, 'verified-token');
  const contractResponse = await service.callTool(principal, {
    name: 'get_frontend_contract', arguments: { contractVersion: 1, fileId }
  });
  assert.equal(contractResponse.isError, false);
  const contract = contractResponse.isError
    ? undefined
    : contractResponse.structuredContent.result as Record<string, unknown>;
  assert.equal(contract?.contractVersion, MCP_CONTRACT_VERSION);
  assert.deepEqual(contract?.concurrency, {
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
  });
  assert.equal(contract?.arbitrarySql, false);
  assert.equal(contract?.arbitraryDdl, false);
  assert.doesNotMatch(JSON.stringify(contract), /physical_name|physicalName|secret_table/);

  const query = await service.callTool(principal, {
    name: 'tabular_records_query',
    arguments: { fileId, columnIds: [columnId], filters: [], sorts: [], limit: 10 }
  });
  assert.equal(query.isError, false);
  assert.doesNotMatch(JSON.stringify(query), /physical_name|physicalName|secret_table/);

  const firstPage = await service.callTool(principal, {
    name: 'tabular_list_files', arguments: { limit: 1 }
  });
  assert.equal(firstPage.isError, false);
  const firstDiscovery = firstPage.isError
    ? undefined
    : firstPage.structuredContent.result as {
      items: Array<{ file: { fileId: string } }>;
      nextCursor?: string;
    };
  assert.equal(firstDiscovery?.items.length, 1);
  assert.ok(firstDiscovery?.nextCursor);
  const secondPage = await service.callTool(principal, {
    name: 'tabular_list_files',
    arguments: { limit: 1, cursor: firstDiscovery?.nextCursor }
  });
  assert.equal(secondPage.isError, false);
  assert.notEqual(
    secondPage.isError
      ? undefined
      : (secondPage.structuredContent.result as typeof firstDiscovery)?.items[0]?.file.fileId,
    firstDiscovery?.items[0]?.file.fileId
  );
  assert.doesNotMatch(JSON.stringify(firstPage), /relationOid|namespaceOid|drift/);

  const resource = await service.readResource(principal, {
    uri: `tabular://frontend-contract/v1/${fileId}`
  });
  assert.equal(resource.isError, false);
  assert.equal(resource.isError ? '' : resource.structuredContent.resource.fileId, fileId);
});

test('kernel safe failures map without exception details or credential material', async () => {
  const capability = capabilityDouble({
    result: {
      ok: false,
      error: {
        code: 'capability_denied',
        message: 'The requested capability is denied',
        retryable: false
      }
    }
  });
  const service = serviceWith(capability);
  const principal = await service.verifyCredential(
    new TestVerifier(['tabular_record_read']),
    'verified-token'
  );
  const response = await service.callTool(principal, {
    name: 'tabular_record_read',
    arguments: { fileId, rowId, columnIds: [columnId] }
  });
  assert.deepEqual(response, {
    isError: true,
    content: [{ type: 'text', text: 'The requested capability is denied' }],
    structuredContent: {
      error: {
        category: 'capability_denied',
        description: 'The requested capability is denied',
        canRetry: false
      }
    }
  });
  assert.doesNotMatch(JSON.stringify(response), /verified-token|postgres|role_name/);
});

test('every declared tool has executable success, validation, and scope-denial coverage', async () => {
  const service = serviceWith(capabilityDouble());
  const principal = await service.verifyCredential(
    new TestVerifier([...MCP_TOOL_DEFINITIONS.map((tool) => tool.name)], [
      'tabular_frontend_contract'
    ]),
    'verified-token'
  );
  for (const definition of MCP_TOOL_DEFINITIONS) {
    const argumentsInput = toolArguments(definition.name);
    const success = await service.callTool(principal, {
      name: definition.name,
      arguments: argumentsInput
    });
    assert.equal(success.isError, false, definition.name);
    const invalid = await service.callTool(principal, {
      name: definition.name,
      arguments: { ...argumentsInput, diagnostics: 'forged' }
    });
    assert.equal(invalid.isError, true, definition.name);
    assert.equal(invalid.isError ? invalid.structuredContent.error.category : '', 'invalid_action');
    const alternate = definition.name === 'tabular_record_read'
      ? 'tabular_list_files'
      : 'tabular_record_read';
    const deniedPrincipal = await service.verifyCredential(
      new TestVerifier([alternate]),
      'verified-token'
    );
    const denied = await service.callTool(deniedPrincipal, {
      name: definition.name,
      arguments: argumentsInput
    });
    assert.equal(denied.isError, true, definition.name);
    assert.equal(denied.isError ? denied.structuredContent.error.category : '',
      'capability_denied');
  }

  const invalidResource = await service.readResource(principal, {
    uri: `tabular://frontend-contract/v2/${fileId}`
  });
  assert.equal(invalidResource.isError, true);
  assert.equal(invalidResource.structuredContent.error.category, 'invalid_action');
  const deniedResourcePrincipal = await service.verifyCredential(
    new TestVerifier(['tabular_record_read']),
    'verified-token'
  );
  const deniedResource = await service.readResource(deniedResourcePrincipal, {
    uri: `tabular://frontend-contract/v1/${fileId}`
  });
  assert.equal(deniedResource.isError, true);
  assert.equal(deniedResource.structuredContent.error.category, 'capability_denied');
});

test('complete failure envelopes cap worst-case validation issues below one MiB', async () => {
  const issues = Array.from({ length: 10_000 }, (_, index) => ({
    columnId: `col_${String(index).padStart(32, 'X')}`,
    code: 'column_unavailable',
    message: 'Unavailable column '.repeat(30)
  }));
  const service = serviceWith(capabilityDouble({
    result: {
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'The action failed validation',
        retryable: false,
        issues
      }
    }
  }));
  const principal = await service.verifyCredential(
    new TestVerifier(['tabular_range_patch']),
    'verified-token'
  );
  const response = await service.callTool(principal, {
    name: 'tabular_range_patch',
    arguments: {
      commandId: 'cmd_abcdefgh',
      fileId,
      cellCount: 1,
      rows: [{
        rowId,
        expectedVersion: `ver_${'v'.repeat(16)}`,
        patch: [{ columnId, value: { type: 'text', value: 'bounded' } }]
      }]
    }
  });
  assert.equal(response.isError, true);
  assert.equal(response.structuredContent.error.category, 'validation_failed');
  assert.equal(response.structuredContent.error.issues?.length, 100);
  assert.ok(Buffer.byteLength(JSON.stringify(response), 'utf8') <= 1_048_576);
});

function schema(toolName: McpToolName, property: string) {
  const tool = MCP_TOOL_DEFINITIONS.find((entry) => entry.name === toolName);
  assert.ok(tool?.inputSchema.properties?.[property]);
  return tool.inputSchema.properties[property];
}

function toolArguments(tool: McpToolName): Record<string, unknown> {
  const commandId = 'cmd_abcdefgh';
  const version = `ver_${'v'.repeat(16)}`;
  const patch = [{ columnId, value: { type: 'text', value: 'accepted' } }];
  const draftId = `draft_${suffix}`;
  switch (tool) {
    case 'get_frontend_contract': return { contractVersion: 1, fileId };
    case 'tabular_list_files': return { limit: 10 };
    case 'tabular_records_query': return {
      fileId, columnIds: [columnId], filters: [], sorts: [], limit: 10
    };
    case 'tabular_record_read': return { fileId, rowId, columnIds: [columnId] };
    case 'tabular_record_patch': return {
      commandId, fileId, rowId, expectedVersion: version, patch
    };
    case 'tabular_record_insert': return { commandId, fileId, patch };
    case 'tabular_record_delete': return { commandId, fileId, rowId, expectedVersion: version };
    case 'tabular_range_patch': return {
      commandId, fileId, cellCount: 1,
      rows: [{ rowId, expectedVersion: version, patch }]
    };
    case 'tabular_draft_create': return {
      commandId, fileId, schemaVersion: 'a'.repeat(64), patch,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    case 'tabular_draft_read': return { draftId };
    case 'tabular_draft_list': return { fileId };
    case 'tabular_draft_update': return {
      commandId, draftId, expectedDraftVersion: 1, patch
    };
    case 'tabular_draft_delete': return { commandId, draftId, expectedDraftVersion: 1 };
    case 'tabular_draft_promote': return { commandId, draftId, expectedDraftVersion: 1 };
    case 'tabular_history_list': return { fileId, limit: 10 };
    case 'tabular_history_undo':
    case 'tabular_history_redo': return { commandId, fileId };
  }
}

function serviceWith(capability: CapabilityPluginService) {
  const runtime = {
    processKind: 'web',
    config: {
      database: {
        connectionId: 'local',
        poolMaximum: 10,
        statementTimeoutMs: 10_000
      },
      server: { requestTimeoutMs: 30_000, shutdownTimeoutMs: 1_000 }
    }
  } as unknown as ApplicationRuntimeService;
  return new McpPluginService(runtime, databaseDouble(), capability, {
    reconcile: async () => ({}) as never,
    discover: async () => ({
      connections: [{ id: 'local' }],
      databases: [{ id: `db_${suffix}`, connectionId: 'local', name: 'tabular' }],
      schemas: [{
        id: `schema_${suffix}`,
        name: 'workspace',
        drift: 'current',
        files: ['N', 'O'].map((seed) => ({
          id: `obj_${seed.repeat(32)}`,
          schemaId: `schema_${suffix}`,
          name: `visible_${seed.toLowerCase()}`,
          kind: 'table' as const,
          readOnly: false,
          drift: 'current' as const,
          columns: [{
            id: `col_${seed.repeat(32)}`,
            name: 'visible_column',
            type: 'text',
            nullable: true,
            drift: 'current' as const
          }]
        }))
      }]
    })
  });
}

function capabilityDouble(input: {
  captured?: CapabilityAction[];
  result?: { ok: false; error: {
    code: string;
    message: string;
    retryable: boolean;
    issues?: Array<{ columnId?: string; code: string; message: string }>;
  } };
} = {}) {
  return {
    execute: async (_authority: unknown, action: CapabilityAction) => {
      input.captured?.push(action);
      return input.result || { ok: true, value: { actionType: action.type } };
    },
    prepareGridTarget: async () => ({ adapter: {}, target: { fileId, schemaVersion: 'a'.repeat(64) } }),
    describeGridTarget: async () => ({
      fileId,
      schemaVersion: 'a'.repeat(64),
      columns: [{
        columnId,
        codec: 'text',
        editable: true,
        key: false,
        generated: false
      }],
      operations: { update: true, insert: true, delete: true }
    }),
    browseGridTarget: async () => ({
      fileId,
      schemaVersion: 'a'.repeat(64),
      columns: [{
        columnId,
        codec: 'text',
        physicalName: 'secret_table_column',
        editable: true,
        key: false,
        generated: false
      }],
      rows: [{ rowId, version: `ver_${'v'.repeat(16)}`, cells: [] }]
    }),
    queryGridTarget: async () => ({
      fileId,
      schemaVersion: 'a'.repeat(64),
      columns: [{
        columnId,
        codec: 'text',
        physicalName: 'secret_table_column',
        editable: true,
        key: false,
        generated: false
      }],
      rows: [{
        rowId,
        version: `ver_${'v'.repeat(16)}`,
        cells: [{ columnId, value: { type: 'text', value: 'visible' } }]
      }]
    })
  } as unknown as CapabilityPluginService;
}

function databaseDouble() {
  const database = {
    execute: async (query: string) => {
      if (query.includes('FROM tabular.identities i')) {
        return { rows: [{
          identity_id: `id_${suffix}`,
          display_name: null,
          identity_generation: 1,
          allowed_role_id: `role_${suffix}`,
          mapping_generation: 1,
          role_oid: '42',
          role_name: 'tabular_member',
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolcanlogin: false,
          rolreplication: false,
          rolbypassrls: false,
          base_role: false,
          can_set_role: true,
          login_authority_valid: true
        }], affectedRows: 0 };
      }
      if (query.includes('WHERE r.rolname = current_user')) {
        return { rows: [{
          oid: '42',
          role_name: 'tabular_member',
          rolsuper: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolcanlogin: false,
          rolreplication: false,
          rolbypassrls: false,
          base_role: false,
          can_set_role: true
        }], affectedRows: 0 };
      }
      if (query.includes('FROM tabular.column_metadata')) {
        return { rows: [{
          column_id: columnId,
          display_name: 'Visible column',
          field_kind: 'text',
          format_kind: 'plain-text',
          field_config: {},
          format_config: {}
        }], affectedRows: 0 };
      }
      throw new Error(`Unexpected database query: ${query.slice(0, 40)}`);
    }
  } as unknown as DatabaseExecutor;
  return {
    transaction: async (
      scope: string,
      options: {
        resolveRole?: (database: DatabaseExecutor) => Promise<{
          role: string;
          verifyAfterSet: (database: DatabaseExecutor) => Promise<void>;
        }>;
        finalizeBase?: (database: DatabaseExecutor, result: unknown) => Promise<unknown>;
      },
      callback: (database: DatabaseExecutor) => Promise<unknown>
    ) => {
      assert.equal(scope, 'web');
      const role = await options.resolveRole?.(database);
      assert.equal(role?.role, 'tabular_member');
      await role?.verifyAfterSet(database);
      const result = await callback(database);
      return options.finalizeBase ? options.finalizeBase(database, result) : result;
    }
  } as unknown as DatabasePluginService;
}
