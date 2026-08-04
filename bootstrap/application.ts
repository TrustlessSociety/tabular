import type { Server as NodeServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Adapter,
  formDataToObject,
  server
} from '@stackpress/ingest/http';
import type { HttpServer } from '@stackpress/ingest/types';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { serve } from 'reactus';
import {
  assertProductionConfiguration,
  loadConfig,
  type TabularConfig
} from '../config/index.js';
import { loadArtifactManifest, type ArtifactManifest } from './artifacts.js';
import { ApplicationError, mapError, sanitizeRouteError } from './errors.js';
import { ApplicationLifecycle } from './lifecycle.js';
import { configureLogging, writeLog } from './logger.js';
import { loadPluginManifest } from './plugins.js';
import { RawHttpHandlerRegistry } from './raw-handlers.js';
import { RuntimeResources } from './resources.js';
import {
  DATABASE_SERVICE,
  type DatabasePluginService
} from '../plugins/database/helpers/service.js';
import {
  IDENTITY_SERVICE,
  type IdentityPluginService
} from '../plugins/identity/helpers/service.js';
import {
  CATALOG_SERVICE,
  type CatalogPluginService
} from '../plugins/catalog/helpers/service.js';
import {
  CAPABILITY_SERVICE,
  type CapabilityPluginService
} from '../plugins/capability/helpers/service.js';
import {
  FILES_SERVICE,
  type FilesPluginService
} from '../plugins/files/helpers/service.js';
import {
  EXPLORER_SERVICE,
  type ExplorerPluginService
} from '../plugins/explorer/helpers/service.js';
import {
  UI_SERVICE,
  type UiPluginService
} from '../plugins/ui/helpers/service.js';
import {
  GRID_SERVICE,
  type GridPluginService
} from '../plugins/grid/helpers/service.js';
import {
  COMMANDS_SERVICE,
  type CommandsPluginService
} from '../plugins/commands/helpers/service.js';
import {
  SAVED_VIEWS_SERVICE,
  type SavedViewsPluginService
} from '../plugins/saved-views/helpers/service.js';
import {
  REALTIME_SERVICE,
  type RealtimePluginService
} from '../plugins/realtime/helpers/service.js';
import {
  IMPORT_EXPORT_SERVICE,
  type ImportExportPluginService
} from '../plugins/import-export/helpers/service.js';
import {
  OPERATIONS_SERVICE,
  type OperationsPluginService
} from '../plugins/operations/helpers/service.js';
import {
  MCP_SERVICE
} from '../plugins/mcp/helpers/contracts.js';
import type { McpPluginService } from '../plugins/mcp/helpers/service.js';

export const RUNTIME_SERVICE = 'tabular.runtime';
export const APP_SERVICE = 'tabular.app';

export type ReactusRuntime = ReturnType<typeof serve>;

export type ApplicationRuntimeService = {
  processKind: 'web' | 'migrator' | 'worker';
  config: TabularConfig;
  lifecycle: ApplicationLifecycle;
  resources: RuntimeResources;
  reactus: ReactusRuntime | undefined;
  artifacts: ArtifactManifest;
  pluginOrder: string[];
  rawHandlers: RawHttpHandlerRegistry;
};

export type AppPluginService = {
  name: typeof APP_SERVICE;
  configName: 'Tabular';
  routes: readonly string[];
};

export type ApplicationServer = HttpServer<
  TabularConfig,
  {
    [RUNTIME_SERVICE]: ApplicationRuntimeService;
    [DATABASE_SERVICE]: DatabasePluginService;
    [IDENTITY_SERVICE]: IdentityPluginService;
    [CATALOG_SERVICE]: CatalogPluginService;
    [CAPABILITY_SERVICE]: CapabilityPluginService;
    [FILES_SERVICE]: FilesPluginService;
    [SAVED_VIEWS_SERVICE]: SavedViewsPluginService;
    [OPERATIONS_SERVICE]: OperationsPluginService;
    [IMPORT_EXPORT_SERVICE]: ImportExportPluginService;
    [EXPLORER_SERVICE]: ExplorerPluginService;
    [UI_SERVICE]: UiPluginService;
    [GRID_SERVICE]: GridPluginService;
    [COMMANDS_SERVICE]: CommandsPluginService;
    [REALTIME_SERVICE]: RealtimePluginService;
    [MCP_SERVICE]: McpPluginService;
    [APP_SERVICE]: AppPluginService;
  }
>;

export type CreateApplicationOptions = {
  processKind?: 'web' | 'migrator' | 'worker';
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  runtimeRoot?: string;
  version?: string;
};

function registerOnce<T>(app: ApplicationServer, name: string, service: T) {
  if (app.plugins.has(name)) throw new Error(`Service already registered: ${name}`);
  app.register(name, service);
  return service;
}

export async function createApplication(options: CreateApplicationOptions = {}) {
  const processKind = options.processKind || 'web';
  const config = loadConfig({ ...options, productionScope: processKind });
  configureLogging(config.environment.logLevel, {
    instanceId: config.environment.instanceId,
    processKind
  });
  const pluginManifest = await loadPluginManifest(config.paths.projectRoot);
  const lifecycle = new ApplicationLifecycle();
  const resources = new RuntimeResources();
  const rawHandlers = new RawHttpHandlerRegistry();
  const artifacts: ArtifactManifest = processKind === 'web'
    ? await loadArtifactManifest(
      config.paths.projectRoot,
      config.reactus.manifestPath,
      config.reactus
    )
    : {
      schemaVersion: 1,
      generatedAt: '1970-01-01T00:00:00.000Z',
      artifacts: []
    };
  const reactus = processKind === 'web'
    ? serve({
      cwd: config.paths.projectRoot,
      clientRoute: config.reactus.clientRoute,
      cssRoute: config.reactus.assetRoute,
      pagePath: config.reactus.pagePath
    })
    : undefined;
  const app = server({
    cwd: config.paths.runtimeRoot,
    plugins: pluginManifest.paths,
    handler: async (context, request, response) => {
      if (!lifecycle.beginRequest()) {
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({
          error: { code: 'service_draining', message: 'The service is draining' }
        }));
        return response;
      }
      try {
        if (await rawHandlers.dispatch(request, response)) return response;
        return await new BoundedHttpAdapter(
          context,
          request,
          response,
          config.server.maxRequestBodyBytes
        ).plug();
      } catch (error) {
        const mapped = mapError(error);
        if (!response.headersSent) {
          response.statusCode = mapped.statusCode;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(mapped.payload));
        } else if (!response.writableEnded) {
          response.end();
        }
        return response;
      } finally {
        lifecycle.endRequest();
      }
    }
  }) as ApplicationServer;
  app.on('error', ({ req, res }) => {
    if (res.code >= 500) {
      writeLog('error', 'route_request_failed', {
        method: req.method,
        path: req.url.pathname,
        statusCode: res.code,
        errorPresent: Boolean(res.error)
      });
    }
    sanitizeRouteError(res);
  }, Number.MIN_SAFE_INTEGER);
  app.config.set(config);
  const runtime: ApplicationRuntimeService = {
    processKind,
    config,
    lifecycle,
    resources,
    reactus,
    artifacts,
    pluginOrder: [],
    rawHandlers
  };
  registerOnce(app, RUNTIME_SERVICE, runtime);
  await app.bootstrap();
  const database = app.plugin<DatabasePluginService>(DATABASE_SERVICE);
  if (!database) throw new Error(`${DATABASE_SERVICE} did not register during bootstrap`);
  const identity = app.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  if (!identity) throw new Error(`${IDENTITY_SERVICE} did not register during bootstrap`);
  const catalog = app.plugin<CatalogPluginService>(CATALOG_SERVICE);
  if (!catalog) throw new Error(`${CATALOG_SERVICE} did not register during bootstrap`);
  const capability = app.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  if (!capability) throw new Error(`${CAPABILITY_SERVICE} did not register during bootstrap`);
  const files = app.plugin<FilesPluginService>(FILES_SERVICE);
  if (!files) throw new Error(`${FILES_SERVICE} did not register during bootstrap`);
  const savedViews = app.plugin<SavedViewsPluginService>(SAVED_VIEWS_SERVICE);
  if (!savedViews) throw new Error(`${SAVED_VIEWS_SERVICE} did not register during bootstrap`);
  const operations = app.plugin<OperationsPluginService>(OPERATIONS_SERVICE);
  if (!operations) throw new Error(`${OPERATIONS_SERVICE} did not register during bootstrap`);
  const importExport = app.plugin<ImportExportPluginService>(IMPORT_EXPORT_SERVICE);
  if (!importExport) throw new Error(`${IMPORT_EXPORT_SERVICE} did not register during bootstrap`);
  const explorer = app.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  if (!explorer) throw new Error(`${EXPLORER_SERVICE} did not register during bootstrap`);
  const ui = app.plugin<UiPluginService>(UI_SERVICE);
  if (!ui) throw new Error(`${UI_SERVICE} did not register during bootstrap`);
  const grid = app.plugin<GridPluginService>(GRID_SERVICE);
  if (!grid) throw new Error(`${GRID_SERVICE} did not register during bootstrap`);
  const commands = app.plugin<CommandsPluginService>(COMMANDS_SERVICE);
  if (!commands) throw new Error(`${COMMANDS_SERVICE} did not register during bootstrap`);
  const realtime = app.plugin<RealtimePluginService>(REALTIME_SERVICE);
  if (!realtime) throw new Error(`${REALTIME_SERVICE} did not register during bootstrap`);
  const mcp = app.plugin<McpPluginService>(MCP_SERVICE);
  if (!mcp) throw new Error(`${MCP_SERVICE} did not register during bootstrap`);
  const appService = app.plugin<AppPluginService>(APP_SERVICE);
  if (!appService) throw new Error(`${APP_SERVICE} did not register during bootstrap`);
  return {
    app,
    appService,
    config,
    runtime,
    database,
    identity,
    catalog,
    capability,
    files,
    savedViews,
    operations,
    importExport,
    explorer,
    ui,
    grid,
    commands,
    realtime,
    mcp
  };
}

class BoundedHttpAdapter extends Adapter<TabularConfig> {
  constructor(
    context: HttpServer<TabularConfig, any>,
    request: IncomingMessage,
    response: ServerResponse,
    private readonly maximumBytes: number
  ) {
    super(context, request, response);
  }

  override request() {
    const request = super.request();
    request.loader = boundedRequestLoader(this._request, this.maximumBytes);
    return request;
  }
}

function boundedRequestLoader(resource: IncomingMessage, maximumBytes: number) {
  return (request: ReturnType<BoundedHttpAdapter['request']>) => new Promise<{
    body: string;
    post: Record<string, unknown>;
  } | undefined>((resolve, reject) => {
    if (request.body !== null) {
      resolve(undefined);
      return;
    }
    const chunks: Buffer[] = [];
    let received = 0;
    const contentLength = Number(resource.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      resource.resume();
      reject(new ApplicationError(
        'request_too_large',
        413,
        `The request exceeds ${maximumBytes} bytes`
      ));
      return;
    }
    const cleanup = () => {
      resource.off('data', onData);
      resource.off('end', onEnd);
      resource.off('error', onError);
      resource.off('aborted', onAborted);
    };
    const fail = (error: Error) => {
      cleanup();
      resource.resume();
      reject(error);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.byteLength;
      if (received > maximumBytes) {
        fail(new ApplicationError(
          'request_too_large',
          413,
          `The request exceeds ${maximumBytes} bytes`
        ));
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      cleanup();
      const body = Buffer.concat(chunks).toString('utf8');
      resolve({
        body,
        post: formDataToObject(request.mimetype, body) as Record<string, unknown>
      });
    };
    const onError = (error: Error) => fail(error);
    const onAborted = () => fail(new ApplicationError(
      'request_aborted',
      400,
      'The request body was interrupted'
    ));
    resource.on('data', onData);
    resource.on('end', onEnd);
    resource.on('error', onError);
    resource.on('aborted', onAborted);
  });
}

export type StartWebOptions = CreateApplicationOptions & {
  host?: string;
  port?: number;
};

export async function startWeb(options: StartWebOptions = {}) {
  const application = await createApplication(options);
  let httpServer: NodeServer | undefined;
  try {
    assertProductionConfiguration(application.config);
    if (application.database.configured('web')) {
      await application.database.assertReady('web');
    }
    httpServer = application.app.create({
      requestTimeout: application.config.server.requestTimeoutMs,
      headersTimeout: application.config.server.headersTimeoutMs,
      keepAliveTimeout: application.config.server.keepAliveTimeoutMs
    });
    application.runtime.resources.register({
      name: 'http-listener',
      ready: () => Boolean(httpServer?.listening),
      close: () => closeHttpServer(httpServer!, application.config.server.shutdownTimeoutMs)
    });
    application.runtime.resources.register({
      name: 'realtime-connections',
      ready: () => true,
      close: () => application.realtime.closeConnections()
    });
    application.runtime.resources.register({
      name: 'mcp-calls',
      ready: () => application.mcp.ready(),
      close: () => application.mcp.close()
    });
    await new Promise<void>((resolve, reject) => {
      httpServer!.once('error', reject);
      httpServer!.listen(
        options.port ?? application.config.server.port,
        options.host || application.config.server.host,
        resolve
      );
    });
    application.runtime.lifecycle.markReady();
  } catch (startupError) {
    application.mcp.beginDrain();
    application.runtime.lifecycle.beginDrain();
    let cleanupError: unknown;
    try {
      await application.runtime.resources.close(application.config.server.shutdownTimeoutMs);
    } catch (error) {
      cleanupError = error;
    } finally {
      application.runtime.lifecycle.markStopped();
    }
    if (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        'Application startup and cleanup failed',
        { cause: startupError }
      );
    }
    throw startupError;
  }
  if (!httpServer) throw new Error('HTTP server was not initialized');
  const address = httpServer.address() as AddressInfo;
  const host = options.host || application.config.server.host;
  const origin = `http://${host}:${address.port}`;
  let closing: Promise<void> | undefined;
  return {
    ...application,
    httpServer,
    origin,
    async close() {
      if (closing) return closing;
      closing = (async () => {
        application.mcp.beginDrain();
        application.runtime.lifecycle.beginDrain();
        const drain = application.runtime.lifecycle.waitForDrain(
          application.config.server.shutdownTimeoutMs
        );
        const close = application.runtime.resources.close(
          application.config.server.shutdownTimeoutMs
        );
        try {
          await Promise.all([drain, close]);
        } finally {
          application.runtime.lifecycle.markStopped();
        }
      })();
      return closing;
    }
  };
}

async function closeHttpServer(httpServer: NodeServer, timeoutMs: number) {
  if (!httpServer.listening) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      httpServer.closeAllConnections();
    }, timeoutMs);
    httpServer.close((error) => {
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    });
  });
}

export function installSignalHandlers(runtime: Awaited<ReturnType<typeof startWeb>>) {
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    writeLog('info', 'shutdown_started', { signal });
    try {
      await runtime.close();
      writeLog('info', 'shutdown_completed', { signal });
      process.exitCode = 0;
    } catch (error) {
      writeLog('error', 'shutdown_failed', {
        signal,
        message: error instanceof Error ? error.message : String(error)
      });
      process.exitCode = 1;
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  return shutdown;
}
