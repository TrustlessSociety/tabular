import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpServer } from '@stackpress/ingest/types';
import { RUNTIME_SERVICE, type ApplicationRuntimeService } from '../../../bootstrap/application.js';
import { CAPABILITY_SERVICE } from '../../capability/helpers/service.js';
import { DATABASE_SERVICE } from '../../database/helpers/service.js';
import { MCP_SERVICE } from '../helpers/contracts.js';
import { McpPluginService } from '../helpers/service.js';
import mcpPlugin from '../plugin.js';

test('MCP plugin registers one backend-only service after runtime, database, and capability', () => {
  const runtime = { pluginOrder: [] } as unknown as ApplicationRuntimeService;
  const dependencies = new Map<string, unknown>([
    [RUNTIME_SERVICE, runtime],
    [DATABASE_SERVICE, {}],
    [CAPABILITY_SERVICE, {}]
  ]);
  const server = serverDouble(dependencies);
  mcpPlugin(server);
  assert.ok(dependencies.get(MCP_SERVICE) instanceof McpPluginService);
  assert.deepEqual(runtime.pluginOrder, [MCP_SERVICE]);
  assert.throws(() => mcpPlugin(server), /already registered/);
});

test('MCP plugin fails closed when an authority dependency is absent', () => {
  const server = serverDouble(new Map([
    [RUNTIME_SERVICE, { pluginOrder: [] }],
    [DATABASE_SERVICE, {}]
  ]));
  assert.throws(() => mcpPlugin(server), /must register before/);
});

function serverDouble(services: Map<string, unknown>) {
  return {
    plugins: services,
    plugin: (name: string) => services.get(name),
    register: (name: string, service: unknown) => services.set(name, service)
  } as unknown as HttpServer<any, any>;
}
