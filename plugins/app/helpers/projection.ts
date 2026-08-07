//client

//The browser method values accepted by the projection are deliberately finite.
export type BrowserMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

//The rendered surfaces are route state, not a server-side page selector.
export type BrowserSurface =
  | 'auth-required'
  | 'explorer'
  | 'table'
  | 'import-entry'
  | 'activity';

//The only route values that may be carried into the initial browser shell.
export type BrowserRouteState = {
  surface?: BrowserSurface,
  folder?: string,
  table?: string,
  view?: string,
  dialog?: 'create' | 'views',
  newFile?: boolean,
};

//The public application identity is safe to render before authentication.
export type BrowserApplicationIdentity = {
  name: string,
  version: string,
};

//The public language and locale values used by browser presentation.
export type BrowserLanguage = {
  locale: string,
  language: string,
};

//The public brand values used by browser presentation.
export type BrowserBrand = {
  name: string,
  logo?: string,
  icon?: string,
};

//The public shell configuration is immutable for the initial render.
export type BrowserShell = {
  status: 'ready' | 'starting',
  title: string,
  density: 'comfortable' | 'compact',
};

//The browser-visible configuration data contains no server configuration.
export type BrowserData = {
  application: BrowserApplicationIdentity,
  language: BrowserLanguage,
  brand: BrowserBrand,
  theme: 'light' | 'dark',
  shell: BrowserShell,
};

//The request projection contains path and allowlisted route state only.
export type BrowserRequest = {
  method: BrowserMethod,
  path: string,
  route: BrowserRouteState,
};

//The session projection contains display identity and presentation flags only.
export type BrowserSession = {
  authenticated: boolean,
  displayName?: string,
  capabilities: Readonly<BrowserCapabilities>,
  csrf?: string,
};

//The capability flags are presentation hints, never authorization grants.
export type BrowserCapabilities = {
  canCreateFile?: boolean,
  canImportFile?: boolean,
  canRenameFile?: boolean,
  canConfigureFile?: boolean,
  canEditCells?: boolean,
  canViewOperations?: boolean,
  canManageViews?: boolean,
};

//The response projection carries status information without response headers.
export type BrowserResponse = {
  code: number,
  status: string,
};

//The complete browser-safe Provider value used by server and client code.
export type BrowserProviderProjection = {
  data: BrowserData,
  request: BrowserRequest,
  session: BrowserSession,
  response: BrowserResponse,
};

//The server input contract forces callers to name every hydrated category.
export type BrowserProjectionInput = {
  application: BrowserApplicationIdentity,
  language?: BrowserLanguage,
  brand?: BrowserBrand,
  theme?: BrowserData['theme'],
  shell: BrowserShell,
  request: {
    method: string,
    path: string,
    route?: BrowserRouteState,
  },
  identity?: {
    authenticated: boolean,
    displayName?: string,
  },
  capabilities?: BrowserCapabilities,
  csrf?: string,
  response: BrowserResponse,
};

/**
 * Project explicit public values into the browser Provider shape.
 */
export function projectBrowserProvider(
  input: BrowserProjectionInput
): BrowserProviderProjection {
  const method = browserMethod(input.request.method);
  const identity = input.identity || { authenticated: false };
  const capabilities = input.capabilities || {};
  const route = projectRouteState(input.request.route);

  return {
    data: {
      application: {
        name: input.application.name,
        version: input.application.version
      },
      language: {
        locale: input.language?.locale || 'en-US',
        language: input.language?.language || 'English'
      },
      brand: {
        name: input.brand?.name || input.application.name,
        ...(input.brand?.logo ? { logo: input.brand.logo } : {}),
        ...(input.brand?.icon ? { icon: input.brand.icon } : {})
      },
      theme: input.theme || 'light',
      shell: {
        status: input.shell.status,
        title: input.shell.title,
        density: input.shell.density
      }
    },
    request: {
      method,
      path: input.request.path,
      route: { ...route }
    },
    session: {
      authenticated: identity.authenticated,
      ...(identity.displayName ? { displayName: identity.displayName } : {}),
      capabilities: projectCapabilities(capabilities),
      ...(input.csrf ? { csrf: input.csrf } : {})
    },
    response: {
      code: input.response.code,
      status: input.response.status
    }
  };
}

/**
 * Serialize only a previously projected Provider value for hydration.
 */
export function serializeBrowserProjection(projection: BrowserProviderProjection) {
  return JSON.stringify(projection);
}

/**
 * Return a supported browser method or fail closed to GET.
 */
function browserMethod(method: string): BrowserMethod {
  const normalized = method.toUpperCase();
  if ([
    'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'
  ].includes(normalized)) {
    return normalized as BrowserMethod;
  }
  return 'GET';
}

/**
 * Copy only the named route coordinates allowed in the browser shell.
 */
function projectRouteState(input: BrowserRouteState | undefined): BrowserRouteState {
  if (!input) return {};
  return {
    ...(isSurface(input.surface) ? { surface: input.surface } : {}),
    ...(safeRouteText(input.folder) ? { folder: input.folder } : {}),
    ...(safeRouteText(input.table) ? { table: input.table } : {}),
    ...(safeRouteText(input.view) ? { view: input.view } : {}),
    ...(input.dialog === 'create' || input.dialog === 'views'
      ? { dialog: input.dialog } : {}),
    ...(typeof input.newFile === 'boolean' ? { newFile: input.newFile } : {})
  };
}

/**
 * Copy only presentation capability flags into the browser projection.
 */
function projectCapabilities(input: BrowserCapabilities): BrowserCapabilities {
  return {
    ...(typeof input.canCreateFile === 'boolean'
      ? { canCreateFile: input.canCreateFile } : {}),
    ...(typeof input.canImportFile === 'boolean'
      ? { canImportFile: input.canImportFile } : {}),
    ...(typeof input.canRenameFile === 'boolean'
      ? { canRenameFile: input.canRenameFile } : {}),
    ...(typeof input.canConfigureFile === 'boolean'
      ? { canConfigureFile: input.canConfigureFile } : {}),
    ...(typeof input.canEditCells === 'boolean'
      ? { canEditCells: input.canEditCells } : {}),
    ...(typeof input.canViewOperations === 'boolean'
      ? { canViewOperations: input.canViewOperations } : {}),
    ...(typeof input.canManageViews === 'boolean'
      ? { canManageViews: input.canManageViews } : {})
  };
}

/**
 * Return whether one value is a bounded route coordinate.
 */
function safeRouteText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(value);
}

/**
 * Return whether one value is a supported rendered surface.
 */
function isSurface(value: unknown): value is BrowserSurface {
  return [
    'auth-required', 'explorer', 'table', 'import-entry', 'activity'
  ].includes(value as string);
}
