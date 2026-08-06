//client
import type { CatalogFile, CallerCatalog } from '../../catalog/helpers/contracts.js';
import type { SavedViewCapabilities } from '../../saved-views/helpers/contracts.js';

//The explorer file contract exported for module callers
export type ExplorerFile = {
  id: string,
  folderId: string,
  slug: string,
  displayName: string,
  physicalName: string,
  kind: CatalogFile['kind'],
  readOnly: boolean,
  columnCount: number,
  recordCount?: number,
  updatedLabel?: string,
  savedViewCapabilities?: SavedViewCapabilities,
};

//The explorer saved view contract exported for module callers
export type ExplorerSavedView = {
  id: string,
  folderId: string,
  fileId: string,
  fileSlug: string,
  slug: string,
  displayName: string,
  sourceFileName: string,
  summary: string,
  access: 'Personal' | 'Shared',
  updatedLabel: string,
};

//The explorer folder contract exported for module callers
export type ExplorerFolder = {
  id: string,
  databaseId: string,
  slug: string,
  displayName: string,
  updatedLabel?: string,
  permissions: {
    createFile: boolean,
    importFile: boolean,
    renameFile: boolean,
    configureFile: boolean,
  },
  files: ExplorerFile[],
  views: ExplorerSavedView[],
};

//The explorer snapshot contract exported for module callers
export type ExplorerSnapshot = {
  connection: { id: string, displayName: string, },
  database: { id: string, connectionId: string, displayName: string, },
  folders: ExplorerFolder[],
};

//The explorer folder permissions contract exported for module callers
export type ExplorerFolderPermissions = ExplorerFolder['permissions'];

//The explorer route state contract exported for module callers
export type ExplorerRouteState = {
  folder?: string,
  tab?: 'files' | 'views',
  scenario?: 'ready' | 'loading' | 'error' | 'denied' | 'empty',
};

//The browser page identity contract exported for module callers
export type BrowserPageIdentity = {
  displayName: string,
};

//The explorer page props contract exported for module callers
export type ExplorerPageProps = {
  application: 'Tabular',
  status: 'starting' | 'ready',
  version: string,
  surface: 'explorer',
  route: ExplorerRouteState,
  snapshot: ExplorerSnapshot,
  identity: BrowserPageIdentity,
  csrfToken: string,
};

//The table page props contract exported for module callers
export type TablePageProps = {
  application: 'Tabular',
  status: 'starting' | 'ready',
  version: string,
  surface: 'table',
  route: {
    folder: string,
    table: string,
    newFile: boolean,
    view?: string,
    dialog?: 'views' | 'create',
    scenario?: 'ready' | 'denied' | 'error',
  },
  snapshot: ExplorerSnapshot,
  identity: BrowserPageIdentity,
  csrfToken: string,
};

//The import entry page props contract exported for module callers
export type ImportEntryPageProps = {
  application: 'Tabular',
  status: 'starting' | 'ready',
  version: string,
  surface: 'import-entry',
  route: { folder: string, },
  snapshot: ExplorerSnapshot,
  identity: BrowserPageIdentity,
  csrfToken: string,
};

//The auth required page props contract exported for module callers
export type AuthRequiredPageProps = {
  application: 'Tabular',
  status: 'starting' | 'ready',
  version: string,
  surface: 'auth-required',
};

//The explorer catalog source contract exported for module callers
export type ExplorerCatalogSource = Pick<CallerCatalog, 'connections' | 'databases' | 'schemas'>;
