//node
import type {
  IncomingMessage,
  Server as NodeServer,
  ServerResponse
} from 'node:http';
import type { AddressInfo } from 'node:net';

//modules
import type { HttpServer } from '@stackpress/ingest/types';
import {
  Adapter,
  formDataToObject,
  server
} from '@stackpress/ingest/http';
import { serve } from 'reactus';

//client
import type { TabularConfig } from '../config/index.js';
import type { CapabilityPluginService } from '../plugins/capability/helpers/service.js';
import type { CatalogPluginService } from '../plugins/catalog/helpers/service.js';
import type { CommandsPluginService } from '../plugins/commands/helpers/service.js';
import type { DatabasePluginService } from '../plugins/database/helpers/service.js';
import type { ExplorerPluginService } from '../plugins/explorer/helpers/service.js';
import type { FilesPluginService } from '../plugins/files/helpers/service.js';
import type { GridPluginService } from '../plugins/grid/helpers/service.js';
import type { IdentityPluginService } from '../plugins/identity/helpers/service.js';
import type { ImportExportPluginService } from '../plugins/import-export/helpers/service.js';
import type { McpPluginService } from '../plugins/mcp/helpers/service.js';
import type { OperationsPluginService } from '../plugins/operations/helpers/service.js';
import type { RealtimePluginService } from '../plugins/realtime/helpers/service.js';
import type { SavedViewsPluginService } from '../plugins/saved-views/helpers/service.js';
import type { UiPluginService } from '../plugins/ui/helpers/service.js';
import type { ArtifactManifest } from './artifacts.js';
import { assertProductionConfiguration, loadConfig } from '../config/index.js';
import { loadArtifactManifest } from './artifacts.js';
import { ApplicationError, mapError, sanitizeRouteError } from './errors.js';
import { ApplicationLifecycle } from './lifecycle.js';
import { configureLogging, writeLog } from './logger.js';
import { loadPluginManifest } from './plugins.js';
import { RawHttpHandlerRegistry } from './raw-handlers.js';
import { RuntimeResources } from './resources.js';
import { DATABASE_SERVICE } from '../plugins/database/helpers/service.js';
import { IDENTITY_SERVICE } from '../plugins/identity/helpers/service.js';
import { CATALOG_SERVICE } from '../plugins/catalog/helpers/service.js';
import { CAPABILITY_SERVICE } from '../plugins/capability/helpers/service.js';
import { FILES_SERVICE } from '../plugins/files/helpers/service.js';
import { EXPLORER_SERVICE } from '../plugins/explorer/helpers/service.js';
import { UI_SERVICE } from '../plugins/ui/helpers/service.js';
import { GRID_SERVICE } from '../plugins/grid/helpers/service.js';
import { COMMANDS_SERVICE } from '../plugins/commands/helpers/service.js';
import { SAVED_VIEWS_SERVICE } from '../plugins/saved-views/helpers/service.js';
import { REALTIME_SERVICE } from '../plugins/realtime/helpers/service.js';
import { IMPORT_EXPORT_SERVICE } from '../plugins/import-export/helpers/service.js';
import { OPERATIONS_SERVICE } from '../plugins/operations/helpers/service.js';
import {
  MCP_SERVICE
} from '../plugins/mcp/helpers/contracts.js';

//The runtime service value exported for module callers
export const RUNTIME_SERVICE = 'tabular.runtime';
//The app service value exported for module callers
export const APP_SERVICE = 'tabular.app';

//The reactus runtime contract exported for module callers
export type ReactusRuntime = ReturnType<typeof serve>;

//The application runtime service contract exported for module callers
export type ApplicationRuntimeService = {
  processKind: 'web' | 'migrator' | 'worker',
  config: TabularConfig,
  lifecycle: ApplicationLifecycle,
  resources: RuntimeResources,
  reactus: ReactusRuntime | undefined,
  artifacts: ArtifactManifest,
  pluginOrder: string[],
  rawHandlers: RawHttpHandlerRegistry,
};

//The app plugin service contract exported for module callers
export type AppPluginService = {
  name: typeof APP_SERVICE,
  configName: 'Tabular',
  routes: readonly string[],
};

//The application server contract exported for module callers
export type ApplicationServer = HttpServer<
  TabularConfig,
  {
    [RUNTIME_SERVICE]: ApplicationRuntimeService,
    [DATABASE_SERVICE]: DatabasePluginService,
    [IDENTITY_SERVICE]: IdentityPluginService,
    [CATALOG_SERVICE]: CatalogPluginService,
    [CAPABILITY_SERVICE]: CapabilityPluginService,
    [FILES_SERVICE]: FilesPluginService,
    [SAVED_VIEWS_SERVICE]: SavedViewsPluginService,
    [OPERATIONS_SERVICE]: OperationsPluginService,
    [IMPORT_EXPORT_SERVICE]: ImportExportPluginService,
    [EXPLORER_SERVICE]: ExplorerPluginService,
    [UI_SERVICE]: UiPluginService,
    [GRID_SERVICE]: GridPluginService,
    [COMMANDS_SERVICE]: CommandsPluginService,
    [REALTIME_SERVICE]: RealtimePluginService,
    [MCP_SERVICE]: McpPluginService,
    [APP_SERVICE]: AppPluginService,
  }
>;

//The create application options contract exported for module callers
export type CreateApplicationOptions = {
  processKind?: 'web' | 'migrator' | 'worker',
  env?: NodeJS.ProcessEnv,
  projectRoot?: string,
  runtimeRoot?: string,
  version?: string,
};

/**
 * Register one service without replacing an existing owner.
 */
function registerOnce<T>(app: ApplicationServer, name: string, service: T) {
  //fail rather than replace a service because plugin ownership is singular
  if (app.plugins.has(name)) throw new Error(`Service already registered: ${name}`);
  app.register(name, service);
  return service;
}

/**
 * Compose the process-specific application and verify every required plugin service.
 */
export async function createApplication(options: CreateApplicationOptions = {}) {
  //load process-scoped configuration before initializing any side-effectful
  // runtime boundary
  const processKind = options.processKind || 'web';
  const config = loadConfig({ ...options, productionScope: processKind });
  configureLogging(config.environment.logLevel, {
    instanceId: config.environment.instanceId,
    processKind
  });

  //prepare deterministic plugin order and lifecycle/resource ownership
  const pluginManifest = await loadPluginManifest(config.paths.projectRoot);
  const lifecycle = new ApplicationLifecycle();
  const resources = new RuntimeResources();
  const rawHandlers = new RawHttpHandlerRegistry();

  //only the web process needs verified Reactus artifacts and a renderer; the
  // migrator and worker retain an explicit empty manifest instead
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

  //the shared handler admits requests through lifecycle accounting before raw
  // streaming routes or bounded Ingest adaptation can consume the body
  const app = server({
    cwd: config.paths.runtimeRoot,
    plugins: pluginManifest.paths,
    handler: async (context, request, response) => {
      //draining processes reject new work without incrementing the in-flight
      // counter that shutdown is waiting to reach zero
      if (!lifecycle.beginRequest()) {
        response.statusCode = 503;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({
          error: { code: 'service_draining', message: 'The service is draining' }
        }));
        return response;
      }
      try {
        //raw upload routes receive the untouched Node request before the
        // generic adapter buffers and parses ordinary request bodies
        if (await rawHandlers.dispatch(request, response)) return response;

        //all other routes receive one body loader capped by the configured
        // request-size boundary
        return await new BoundedHttpAdapter(
          context,
          request,
          response,
          config.server.maxRequestBodyBytes
        ).plug();
      } catch (error) {
        //map failures only while the response is still writable; once headers
        // have escaped, finish the stream without attempting a second envelope
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
        //every admitted request decrements exactly once, including raw-handler
        // responses and mapped failures
        lifecycle.endRequest();
      }
    }
  }) as ApplicationServer;

  //sanitize framework route errors at the lowest priority after logging owned
  // server failures
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

  //publish config and runtime ownership before plugins bootstrap so each
  // registration sees the same shared process services
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

  //resolve every mandatory service immediately after bootstrap so a partial
  // plugin graph fails startup instead of surfacing later at request time
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

  //return the typed service graph used by entrypoints, tests, and cleanup
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
  /**
   * Create an Ingest adapter that caps the raw request body size.
   */
  public constructor(
    //Ingest owns the dynamically registered plugin service map at this adapter
    // boundary, so a narrower static service type is not available here yet
    context: ApplicationServer,
    request: IncomingMessage,
    response: ServerResponse,
    private readonly maximumBytes: number
  ) {
    super(context, request, response);
  }

  /**
   * Return the request with the bounded body loader attached.
   */
  public override request() {
    //retain Ingest's normalized request shape and replace only its body loader
    const request = super.request();
    request.loader = boundedRequestLoader(this._request, this.maximumBytes);
    return request;
  }
}

/**
 * Build the loader that reads and parses one request within the byte limit.
 */
function boundedRequestLoader(resource: IncomingMessage, maximumBytes: number) {
  return (request: ReturnType<BoundedHttpAdapter['request']>) => new Promise<{
    body: string,
    post: Record<string, unknown>,
  } | undefined>((resolve, reject) => {
    //a prior adapter already populated the body, so this loader has no work
    if (request.body !== null) {
      resolve(undefined);
      return;
    }

    //track exact received bytes because chunk boundaries do not correspond to
    // encoded string length
    const chunks: Buffer[] = [];
    let received = 0;
    const contentLength = Number(resource.headers['content-length']);

    //reject a known oversized body before attaching data listeners
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      resource.resume();
      reject(new ApplicationError(
        'request_too_large',
        413,
        `The request exceeds ${maximumBytes} bytes`
      ));
      return;
    }

    /**
     * Remove every listener owned by this one-shot loader.
     */
    const cleanup = () => {
      resource.off('data', onData);
      resource.off('end', onEnd);
      resource.off('error', onError);
      resource.off('aborted', onAborted);
    };
    /**
     * Stop reading useful data and reject after releasing listener ownership.
     */
    const fail = (error: Error) => {
      cleanup();
      resource.resume();
      reject(error);
    };
    /**
     * Handle the data event.
     */
    const onData = (chunk: Buffer | string) => {
      //normalize string chunks before counting and storing their byte length
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.byteLength;

      //streamed bodies without a trustworthy Content-Length still fail as soon
      // as they cross the configured boundary
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
    /**
     * Handle the end event.
     */
    const onEnd = () => {
      //release listeners before resolving the parsed body to downstream code
      cleanup();
      const body = Buffer.concat(chunks).toString('utf8');
      resolve({
        body,
        post: formDataToObject(request.mimetype, body) as Record<string, unknown>
      });
    };
    /**
     * Handle the error event.
     */
    const onError = (error: Error) => fail(error);
    /**
     * Handle the aborted event.
     */
    const onAborted = () => fail(new ApplicationError(
      'request_aborted',
      400,
      'The request body was interrupted'
    ));

    //attach listeners only after every cleanup and failure callback exists
    resource.on('data', onData);
    resource.on('end', onEnd);
    resource.on('error', onError);
    resource.on('aborted', onAborted);
  });
}

//The start web options contract exported for module callers
export type StartWebOptions = CreateApplicationOptions & {
  host?: string,
  port?: number,
};

/**
 * Start the web application and its HTTP listener.
 */
export async function startWeb(options: StartWebOptions = {}) {
  //compose the full plugin graph before opening a network listener
  const application = await createApplication(options);
  let httpServer: NodeServer | undefined;
  try {
    //fail production misconfiguration and database readiness before any client
    // can observe a listening socket
    assertProductionConfiguration(application.config);
    if (application.database.configured('web')) {
      await application.database.assertReady('web');
    }

    //create the Node server with the reviewed timeout boundaries
    httpServer = application.app.create({
      requestTimeout: application.config.server.requestTimeoutMs,
      headersTimeout: application.config.server.headersTimeoutMs,
      keepAliveTimeout: application.config.server.keepAliveTimeoutMs
    });

    //register network, realtime, and MCP resources in dependency order so
    // reverse cleanup drains the most recently registered boundary first
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

    //wait for the actual listen callback before announcing lifecycle readiness
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
    //a partial startup enters draining state before best-effort cleanup begins
    application.mcp.beginDrain();
    application.runtime.lifecycle.beginDrain();
    let cleanupError: unknown;
    try {
      await application.runtime.resources.close(application.config.server.shutdownTimeoutMs);
    } catch (error) {
      //retain cleanup failure separately so the original startup cause is not
      // lost when both phases fail
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

  //the successful path must always own a concrete listening server and origin
  if (!httpServer) throw new Error('HTTP server was not initialized');
  const address = httpServer.address() as AddressInfo;
  const host = options.host || application.config.server.host;
  const origin = `http://${host}:${address.port}`;
  let closing: Promise<void> | undefined;
  return {
    ...application,
    httpServer,
    origin,
    /**
     * Drain requests and close every registered runtime resource exactly once.
     */
    async close() {
      //signals and explicit callers share one idempotent shutdown promise
      if (closing) return closing;
      closing = (async () => {
        //stop accepting governed work before waiting on admitted requests
        application.mcp.beginDrain();
        application.runtime.lifecycle.beginDrain();
        const drain = application.runtime.lifecycle.waitForDrain(
          application.config.server.shutdownTimeoutMs
        );
        const close = application.runtime.resources.close(
          application.config.server.shutdownTimeoutMs
        );
        try {
          //request draining and resource cleanup share the same shutdown phase
          await Promise.all([drain, close]);
        } finally {
          application.runtime.lifecycle.markStopped();
        }
      })();
      return closing;
    }
  };
}

/**
 * Close the HTTP server.
 */
async function closeHttpServer(httpServer: NodeServer, timeoutMs: number) {
  //an unbound or already closed server requires no Node cleanup
  if (!httpServer.listening) return;

  //allow ordinary connection draining until the deadline, then force any
  // remaining sockets closed so process shutdown can complete
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

/**
 * Install idempotent SIGINT and SIGTERM handlers for one web runtime.
 */
export function installSignalHandlers(runtime: Awaited<ReturnType<typeof startWeb>>) {
  let shuttingDown = false;

  /**
   * Close the runtime once and translate the outcome to the process exit code.
   */
  const shutdown = async (signal: NodeJS.Signals) => {
    //multiple signals share the first shutdown attempt instead of racing close
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

  //register one-shot listeners so Node never accumulates duplicate handlers
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  return shutdown;
}
