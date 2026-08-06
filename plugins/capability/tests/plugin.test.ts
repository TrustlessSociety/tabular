//node
import assert from 'node:assert/strict';
import test from 'node:test';

//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type {
  AuthorityPhases,
  CapabilityAction,
  CapabilityTargetAdapter
} from '../helpers/contracts.js';
import { createApplication } from '../../../bootstrap/application.js';
import { AuthorizedExecutionContext, McpAuthorizedExecutionContext } from '../helpers/contracts.js';
import { DatabaseExecutor as Executor } from '../../database/helpers/executor.js';
import { WebCapabilityAdapter } from '../events/web-adapter.js';
import { McpShapedCapabilityAdapter } from '../events/mcp-shaped-adapter.js';
import { CapabilityPluginService } from '../helpers/service.js';
import capabilityPlugin from '../plugin.js';

const suffix = 'A'.repeat(43);
const fileId = `obj_${suffix}`;
const rowId = `row_${suffix}`;
const columnId = `col_${suffix}`;
const schemaVersion = 'a'.repeat(64);

class TestTarget implements CapabilityTargetAdapter {
  //The name state retained by this class instance
  public readonly name = 'test-target';
  //The calls state retained by this class instance
  public calls = 0;
  //The maximum result bytes state retained by this class instance
  public maximumResultBytes: number | undefined;

  /**
   * Prepare the current value.
   */
  public async prepare(_database: DatabaseExecutor, requestedFileId: string) {
    if (requestedFileId !== fileId) return undefined;
    return { fileId, schemaVersion, state: {} };
  }

  /**
   * Validate the patch.
   */
  public async validatePatch() { return []; }

  /**
   * Handle the authorize operation.
   */
  public async authorize() { this.calls += 1; }

  /**
   * Describe the current value.
   */
  public async describe() {
    return {
      fileId,
      schemaVersion,
      columns: [{
        columnId, codec: 'text' as const, editable: true, key: false, generated: false
      }],
      operations: { update: true, insert: false, delete: false }
    };
  }

  /**
   * Read the current value.
   */
  public async read(
    _database: DatabaseExecutor,
    _target: unknown,
    _rowId: string,
    _columnIds: string[],
    maximumResultBytes?: number
  ) {
    this.maximumResultBytes = maximumResultBytes;
    return {
      rowId,
      version: `ver_${'v'.repeat(20)}`,
      cells: [{ columnId, value: { type: 'text' as const, value: 'visible' } }]
    };
  }

  /**
   * Handle the mutate operation.
   */
  public async mutate(): Promise<never> {
    throw new Error('Mutation is not used by this contract test');
  }
}

class TestMcpAuthority extends McpAuthorizedExecutionContext {
  //The transactions state retained by this class instance
  public transactions = 0;

  /**
   * Create a TestMcpAuthority instance.
   */
  public constructor(private readonly allowed = true, private readonly database: DatabaseExecutor) {
    super({
      actorIdentityId: `id_${suffix}`,
      sessionId: `mcp_${suffix}`,
      historyScopeId: `hist_${suffix}`,
      connectionId: 'local',
      expiresAt: new Date(Date.now() + 60_000)
    });
  }

  /**
   * Handle the allows operation.
   */
  public allows(_action: CapabilityAction) { return this.allowed; }

  /**
   * Handle the transaction operation.
   */
  public async transaction<TargetResult, FinalResult = TargetResult>(
    _capability: 'tabular.capability',
    phases: AuthorityPhases<TargetResult, FinalResult>
  ) {
    this.transactions += 1;
    await phases.prepareBase?.(this.database);
    const result = await phases.target(this.database);
    return phases.finalizeBase
      ? phases.finalizeBase(this.database, result)
      : result as unknown as FinalResult;
  }
}

test('capability plugin registers after catalog as one stable service', async () => {
  const application = await createApplication({
    env: { NODE_ENV: 'test' },
    projectRoot: process.cwd(),
    runtimeRoot: process.cwd()
  });
  assert.equal(application.capability.name, 'tabular.capability');
  assert.equal(application.app.plugin('tabular.capability'), application.capability);
  assert.throws(() => capabilityPlugin(application.app), /already registered/);
});

test('web and MCP-shaped adapters map independent envelopes to one read contract', async () => {
  const database = emptyDatabase();
  const target = new TestTarget();
  const capability = new CapabilityPluginService();
  capability.registerTargetAdapter(target);
  let webTransactions = 0;
  const identity = {
    authorizedTransaction: async <TargetResult, FinalResult = TargetResult>(
      _principal: BrowserPrincipal,
      _capability: string,
      callback: (database: DatabaseExecutor) => Promise<TargetResult>,
      prepare?: (database: DatabaseExecutor) => Promise<void>,
      finalize?: (database: DatabaseExecutor, result: TargetResult) => Promise<FinalResult>
    ) => {
      webTransactions += 1;
      await prepare?.(database);
      const result = await callback(database);
      return finalize ? finalize(database, result) : result as unknown as FinalResult;
    }
  } as unknown as IdentityPluginService;
  const principal: BrowserPrincipal = {
    transport: 'browser',
    sessionId: `sess_${suffix}`,
    identityId: `id_${suffix}`,
    historyScopeId: `hist_${suffix}`,
    connectionId: 'local',
    idleExpiresAt: new Date(Date.now() + 30_000),
    absoluteExpiresAt: new Date(Date.now() + 60_000)
  };
  const web = await new WebCapabilityAdapter(identity, capability).invoke(principal, {
    action: { type: 'record.read', fileId, rowId, columnIds: [columnId] }
  });
  const mcpAuthority = new TestMcpAuthority(true, database);
  const mcp = await new McpShapedCapabilityAdapter(capability).invoke(mcpAuthority, {
    tool: 'tabular_record_read',
    arguments: { fileId, rowId, columnIds: [columnId] }
  });
  assert.equal(web.status, 'ok');
  assert.equal(mcp.isError, false);
  assert.deepEqual(
    web.status === 'ok' ? web.data : undefined,
    mcp.isError ? undefined : mcp.structuredContent.result
  );
  assert.equal(webTransactions, 1);
  assert.equal(mcpAuthority.transactions, 1);
  assert.equal(target.calls, 2);
  assert.notDeepEqual(web, mcp, 'surface output policy must remain independent');
});

test('closed contracts and surface policy deny forged authority before checkout', async () => {
  const database = emptyDatabase();
  const capability = new CapabilityPluginService();
  capability.registerTargetAdapter(new TestTarget());
  const denied = new TestMcpAuthority(false, database);
  const policyResult = await capability.execute(denied, {
    type: 'record.read', fileId, rowId, columnIds: [columnId]
  });
  assert.deepEqual(policyResult, {
    ok: false,
    error: {
      code: 'capability_denied',
      message: 'The requested capability is denied',
      retryable: false
    }
  });
  assert.equal(denied.transactions, 0);

  let browserTransactions = 0;
  const browserIdentity = {
    authorizedTransaction: async () => {
      browserTransactions += 1;
      throw new Error('A denied browser mutation must not check out a transaction');
    }
  } as unknown as IdentityPluginService;
  const ordinaryBrowserPrincipal: BrowserPrincipal = {
    transport: 'browser',
    sessionId: `sess_${suffix}`,
    identityId: `id_${suffix}`,
    historyScopeId: `hist_${suffix}`,
    connectionId: 'local',
    idleExpiresAt: new Date(Date.now() + 30_000),
    absoluteExpiresAt: new Date(Date.now() + 60_000)
  };
  const deniedWebMutation = await new WebCapabilityAdapter(
    browserIdentity,
    capability
  ).invoke(ordinaryBrowserPrincipal, { action: {
    type: 'record.patch',
    commandId: 'cmd_abcdefgh',
    fileId,
    rowId,
    expectedVersion: `ver_${'v'.repeat(20)}`,
    patch: [{ columnId, value: { type: 'text', value: 'denied' } }]
  } });
  assert.equal(deniedWebMutation.status, 'error');
  assert.equal(
    deniedWebMutation.status === 'error' ? deniedWebMutation.error.code : '',
    'capability_denied'
  );
  assert.equal(browserTransactions, 0);

  const allowed = new TestMcpAuthority(true, database);
  const invalid = await capability.execute(allowed, {
    type: 'record.read', fileId, rowId, columnIds: [columnId], role: 'postgres'
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.ok ? '' : invalid.error.code, 'invalid_action');
  assert.equal(allowed.transactions, 0);

  for (const action of [
    {
      type: 'draft.create', commandId: 'cmd_abcdefgh', fileId,
      rowId: '', schemaVersion, patch: [], expiresAt: new Date(Date.now() + 60_000).toISOString()
    },
    { type: 'history.undo', commandId: 'cmd_abcdefgh', fileId: '' },
    { type: 'history.redo', commandId: 'cmd_abcdefgh', fileId: '' }
  ]) {
    const optionalIdentifier = await capability.execute(allowed, action);
    assert.equal(optionalIdentifier.ok, false);
    assert.equal(optionalIdentifier.ok ? '' : optionalIdentifier.error.code, 'invalid_action');
  }
  assert.equal(allowed.transactions, 0);

  const forgedMcp = await new McpShapedCapabilityAdapter(capability).invoke(allowed, {
      tool: 'tabular_record_read',
      arguments: { fileId, rowId, columnIds: [columnId], sql: 'SELECT secret' }
    });
  assert.equal(forgedMcp.isError, true);
  assert.equal(
    forgedMcp.isError ? forgedMcp.structuredContent.error.category : '',
    'invalid_action'
  );
  assert.equal(allowed.transactions, 0);

  const overriddenTool = await new McpShapedCapabilityAdapter(capability).invoke(allowed, {
    tool: 'tabular_record_read',
    arguments: { type: 'history.undo', commandId: 'cmd_abcdefgh', fileId }
  });
  assert.equal(overriddenTool.isError, true);
  assert.equal(
    overriddenTool.isError ? overriddenTool.structuredContent.error.category : '',
    'invalid_action'
  );
  assert.equal(allowed.transactions, 0);
});

test('transport result budgets reach target reads without entering public action payloads', async () => {
  const database = emptyDatabase();
  const capability = new CapabilityPluginService();
  const target = new TestTarget();
  capability.registerTargetAdapter(target);
  const authority = new TestMcpAuthority(true, database);
  const result = await capability.execute(authority, {
    type: 'record.read', fileId, rowId, columnIds: [columnId]
  }, { maximumResultBytes: 262_144 });
  assert.equal(result.ok, true);
  assert.equal(target.maximumResultBytes, 262_144);
});

test('range validation rejects duplicate rows and mismatched cell counts before checkout', async () => {
  const authority = new TestMcpAuthority(true, emptyDatabase());
  const result = await new CapabilityPluginService().execute(authority, {
    type: 'range.patch',
    commandId: 'cmd_abcdefgh',
    fileId,
    cellCount: 2,
    rows: [{
      rowId,
      expectedVersion: `ver_${'v'.repeat(20)}`,
      patch: [{ columnId, value: { type: 'integer', value: '1' } }]
    }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.error.code, 'invalid_action');
  assert.equal(authority.transactions, 0);

  const oversized = await new CapabilityPluginService().execute(authority, {
    type: 'range.patch',
    commandId: 'cmd_abcdefgh',
    fileId,
    cellCount: 10_001,
    rows: []
  });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.ok ? '' : oversized.error.code, 'invalid_action');
  assert.equal(authority.transactions, 0);

  for (const value of ['08/01/2026', '2026-02-30', '2026-08-01T00:00:00Z']) {
    const invalidDate = await new CapabilityPluginService().execute(authority, {
      type: 'record.patch',
      commandId: 'cmd_abcdefgh',
      fileId,
      rowId,
      expectedVersion: `ver_${'v'.repeat(20)}`,
      patch: [{ columnId, value: { type: 'date', value } }]
    });
    assert.equal(invalidDate.ok, false);
    assert.equal(invalidDate.ok ? '' : invalidDate.error.code, 'invalid_action');
  }
  assert.equal(authority.transactions, 0);
});

/**
 * Report the empty database condition.
 */
function emptyDatabase() {
  return new Executor({
    raw: async () => ({ rows: [], rowCount: 0 })
  });
}
