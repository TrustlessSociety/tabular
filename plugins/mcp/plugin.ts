import type { HttpServer } from '@stackpress/ingest/types';
import {
  RUNTIME_SERVICE,
  type ApplicationRuntimeService
} from '../../bootstrap/application.js';
import {
  CAPABILITY_SERVICE,
  type CapabilityPluginService
} from '../capability/helpers/service.js';
import {
  DATABASE_SERVICE,
  type DatabasePluginService
} from '../database/helpers/service.js';
import { MCP_SERVICE } from './helpers/contracts.js';
import { McpPluginService } from './helpers/service.js';

export default function mcpPlugin(server: HttpServer<any, any>) {
  if (server.plugins.has(MCP_SERVICE)) {
    throw new Error(`Service already registered: ${MCP_SERVICE}`);
  }
  const runtime = server.plugin<ApplicationRuntimeService>(RUNTIME_SERVICE);
  const database = server.plugin<DatabasePluginService>(DATABASE_SERVICE);
  const capability = server.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  if (!runtime || !database || !capability) {
    throw new Error(
      `${RUNTIME_SERVICE}, ${DATABASE_SERVICE}, and ${CAPABILITY_SERVICE} must register before ${MCP_SERVICE}`
    );
  }
  const service = new McpPluginService(runtime, database, capability);
  server.register(MCP_SERVICE, service);
  runtime.pluginOrder.push(MCP_SERVICE);
}

export {
  GovernedMcpExecutionContext,
  MCP_CONTRACT_VERSION,
  MCP_FRONTEND_RESOURCE_TEMPLATE,
  MCP_SERVICE,
  MCP_TOOL_DEFINITIONS,
  McpCredentialVerifier,
  type VerifiedMcpPrincipal
} from './helpers/contracts.js';
export { GovernedMcpTransportAdapter } from './events/adapter.js';
export { McpPluginService } from './helpers/service.js';
