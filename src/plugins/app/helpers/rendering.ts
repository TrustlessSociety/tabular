//client
import type { HttpRequest, HttpResponse } from '@stackpress/ingest';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import type {
  BrowserCapabilities,
  BrowserRouteState,
  BrowserSurface
} from './projection.js';
import { projectBrowserProvider } from './projection.js';
import { versionPublicArtifactReferences } from './assets.js';

/**
 * Redirect an unauthenticated product request to the ordinary login route.
 */
export async function renderAuthenticationRequired(
  response: HttpResponse,
  _runtime: ApplicationRuntimeService
) {
  response.headers.set('Cache-Control', 'no-store');
  response.redirect('/auth/login', 303);
}

/**
 * Prepare the typed page payload that the paired Reactus view will consume.
 */
export async function prepareProductPage(
  response: HttpResponse,
  runtime: ApplicationRuntimeService,
  page: Record<string, unknown>,
  code = 200
) {
  const resources = await runtime.resources.readiness();
  const status = runtime.lifecycle.phase === 'ready' && resources.ready
    ? 'ready'
    : 'starting';
  response.statusCode(code);
  response.data.set({
    application: 'Tabular',
    status,
    version: runtime.config.app.version,
    ...page
  });
}

/**
 * Render the view entry selected by Ingest after its lazy handler completes.
 */
export async function renderRegisteredView(
  entry: string,
  request: HttpRequest,
  response: HttpResponse,
  runtime: ApplicationRuntimeService
) {
  //A redirect or an already materialized API/body response owns the request.
  if (response.redirected || response.body !== null) return;
  if (!runtime.reactus) throw new Error('Reactus is available only in the web process');

  const code = response.code || 200;
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );

  //Ingest exposes response data as a Nest object. Read the handler's prepared
  //payload without copying request, session, or response controller objects.
  const data = response.data.get<Record<string, unknown>>();
  const provider = projectBrowserProvider({
    application: {
      name: runtime.config.app.name,
      version: runtime.config.app.version
    },
    shell: {
      status: data.status === 'ready' ? 'ready' : 'starting',
      title: 'Tabular',
      density: 'comfortable'
    },
    request: {
      method: request.method,
      path: request.url.pathname,
      route: pageRouteState(data)
    },
    identity: pageIdentity(data),
    capabilities: pageCapabilities(data),
    csrf: typeof data.csrfToken === 'string' ? data.csrfToken : undefined,
    response: {
      code,
      status: code >= 400 ? 'error' : 'ok'
    }
  });
  const html = await runtime.reactus.render(entry, { data, provider });
  response.html(versionPublicArtifactReferences(html, runtime.artifacts), code);
}

/**
 * Project safe route coordinates from a feature page payload.
 */
function pageRouteState(page: Record<string, unknown>): BrowserRouteState {
  const route = isRecord(page.route) ? page.route : {};
  return {
    ...(isSurface(page.surface) ? { surface: page.surface } : {}),
    ...(safeText(route.folder) ? { folder: route.folder } : {}),
    ...(safeText(route.table) ? { table: route.table } : {}),
    ...(safeText(route.view) ? { view: route.view } : {}),
    ...(route.dialog === 'create' || route.dialog === 'views'
      ? { dialog: route.dialog } : {}),
    ...(typeof route.newFile === 'boolean' ? { newFile: route.newFile } : {})
  };
}

/**
 * Project only the display identity fields allowed in the browser shell.
 */
function pageIdentity(page: Record<string, unknown>) {
  const identity = isRecord(page.identity) ? page.identity : {};
  return {
    authenticated: Boolean(safeText(identity.displayName)),
    ...(safeText(identity.displayName) ? { displayName: identity.displayName } : {})
  };
}

/**
 * Project only presentation capability flags from a feature payload.
 */
function pageCapabilities(page: Record<string, unknown>): BrowserCapabilities {
  const capabilities = isRecord(page.capabilities) ? page.capabilities : {};
  return {
    ...(typeof capabilities.canCreateFile === 'boolean'
      ? { canCreateFile: capabilities.canCreateFile } : {}),
    ...(typeof capabilities.canImportFile === 'boolean'
      ? { canImportFile: capabilities.canImportFile } : {}),
    ...(typeof capabilities.canRenameFile === 'boolean'
      ? { canRenameFile: capabilities.canRenameFile } : {}),
    ...(typeof capabilities.canConfigureFile === 'boolean'
      ? { canConfigureFile: capabilities.canConfigureFile } : {}),
    ...(typeof capabilities.canEditCells === 'boolean'
      ? { canEditCells: capabilities.canEditCells } : {}),
    ...(typeof capabilities.canViewOperations === 'boolean'
      ? { canViewOperations: capabilities.canViewOperations } : {}),
    ...(typeof capabilities.canManageViews === 'boolean'
      ? { canManageViews: capabilities.canManageViews } : {})
  };
}

/**
 * Return whether a value is an allowed browser surface.
 */
function isSurface(value: unknown): value is BrowserSurface {
  return [
    'auth-required', 'explorer', 'table', 'import-entry', 'activity'
  ].includes(value as string);
}

/**
 * Return whether a value is a safe route/display string.
 */
function safeText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Return whether a value is an object-shaped route or identity payload.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
