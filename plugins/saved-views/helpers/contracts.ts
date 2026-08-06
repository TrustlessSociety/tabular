//client
import type {
  GridCellPresentation,
  GridFilter,
  GridSort
} from '../../grid/helpers/contracts.js';

//The saved view access contract exported for module callers
export type SavedViewAccess = 'private' | 'shared';

//The saved view definition contract exported for module callers
export type SavedViewDefinition = {
  schemaVersion: 1,
  columnOrder: string[],
  hiddenColumnIds: string[],
  sorts: GridSort[],
  filters: GridFilter[],
  presentation: Record<string, GridCellPresentation>,
  includes: {
    filtersAndSorting: boolean,
    columnLayout: boolean,
    cellPresentation: boolean,
  },
};

//The saved view contract exported for module callers
export type SavedView = {
  id: string,
  fileId: string,
  ownerIdentityId: string,
  name: string,
  slug: string,
  access: SavedViewAccess,
  definition: SavedViewDefinition,
  version: number,
  createdAt: string,
  updatedAt: string,
  permissions: {
    update: boolean,
    delete: boolean,
    duplicate: boolean,
  },
};

//The saved view capabilities contract exported for module callers
export type SavedViewCapabilities = {
  canCreatePrivate: boolean,
  canPublishShared: boolean,
  canMoveRows: boolean,
  rowOrderState: 'ready' | 'install-required' | 'denied' | 'maintenance',
  rowOrderVersion?: number,
  rowOrderReason?: string,
};

//The saved view collection contract exported for module callers
export type SavedViewCollection = {
  views: SavedView[],
  capabilities: Record<string, SavedViewCapabilities>,
  cursor: number,
};

//The create saved view input contract exported for module callers
export type CreateSavedViewInput = {
  fileId: string,
  name: string,
  access: SavedViewAccess,
  definition: SavedViewDefinition,
};

//The update saved view input contract exported for module callers
export type UpdateSavedViewInput = {
  viewId: string,
  expectedVersion: number,
  name: string,
  access: SavedViewAccess,
  definition: SavedViewDefinition,
};

//The move row input contract exported for module callers
export type MoveRowInput = {
  fileId: string,
  rowId: string,
  beforeRowId?: string,
  afterRowId?: string,
  expectedVersion: number,
};

//The saved view action contract exported for module callers
export type SavedViewAction =
  | ({ type: 'saved-view.create', commandId: string, } & CreateSavedViewInput)
  | ({ type: 'saved-view.update', commandId: string, } & UpdateSavedViewInput)
  | {
    type: 'saved-view.duplicate',
    commandId: string,
    viewId: string,
    name: string,
    access: SavedViewAccess,
  }
  | {
    type: 'saved-view.delete',
    commandId: string,
    viewId: string,
    expectedVersion: number,
  }
  | ({ type: 'row-order.move', commandId: string, } & MoveRowInput);

//The row order move effect contract exported for module callers
export type RowOrderMoveEffect = {
  fileId: string,
  rebalanced: boolean,
};
