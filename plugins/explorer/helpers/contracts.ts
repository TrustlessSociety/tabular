import type { CatalogFile, CallerCatalog } from '../../catalog/helpers/contracts.js';
import type { SavedViewCapabilities } from '../../saved-views/helpers/contracts.js';

export type ExplorerFile = {
  id: string;
  folderId: string;
  slug: string;
  displayName: string;
  physicalName: string;
  kind: CatalogFile['kind'];
  readOnly: boolean;
  columnCount: number;
  recordCount?: number;
  updatedLabel?: string;
  savedViewCapabilities?: SavedViewCapabilities;
};

export type ExplorerSavedView = {
  id: string;
  folderId: string;
  fileId: string;
  fileSlug: string;
  slug: string;
  displayName: string;
  sourceFileName: string;
  summary: string;
  access: 'Personal' | 'Shared';
  updatedLabel: string;
};

export type ExplorerFolder = {
  id: string;
  databaseId: string;
  slug: string;
  displayName: string;
  updatedLabel?: string;
  permissions: {
    createFile: boolean;
    importFile: boolean;
    renameFile: boolean;
    configureFile: boolean;
  };
  files: ExplorerFile[];
  views: ExplorerSavedView[];
};

export type ExplorerSnapshot = {
  connection: { id: string; displayName: string };
  database: { id: string; connectionId: string; displayName: string };
  folders: ExplorerFolder[];
};

export type ExplorerFolderPermissions = ExplorerFolder['permissions'];

export type ExplorerRouteState = {
  folder?: string;
  tab?: 'files' | 'views';
  scenario?: 'ready' | 'loading' | 'error' | 'denied' | 'empty';
};

export type BrowserPageIdentity = {
  displayName: string;
};

export type ExplorerPageProps = {
  application: 'Tabular';
  status: 'starting' | 'ready';
  version: string;
  surface: 'explorer';
  route: ExplorerRouteState;
  snapshot: ExplorerSnapshot;
  identity: BrowserPageIdentity;
  csrfToken: string;
};

export type TablePageProps = {
  application: 'Tabular';
  status: 'starting' | 'ready';
  version: string;
  surface: 'table';
  route: {
    folder: string;
    table: string;
    newFile: boolean;
    view?: string;
    dialog?: 'views' | 'create';
    scenario?: 'ready' | 'denied' | 'error';
  };
  snapshot: ExplorerSnapshot;
  identity: BrowserPageIdentity;
  csrfToken: string;
};

export type ImportEntryPageProps = {
  application: 'Tabular';
  status: 'starting' | 'ready';
  version: string;
  surface: 'import-entry';
  route: { folder: string };
  snapshot: ExplorerSnapshot;
  identity: BrowserPageIdentity;
  csrfToken: string;
};

export type AuthRequiredPageProps = {
  application: 'Tabular';
  status: 'starting' | 'ready';
  version: string;
  surface: 'auth-required';
};

export type ExplorerCatalogSource = Pick<CallerCatalog, 'connections' | 'databases' | 'schemas'>;
