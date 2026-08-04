import type { BrowserMutationPrincipal, BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { CatalogPluginService } from '../../catalog/helpers/service.js';
import type { FilesPluginService } from '../../files/helpers/service.js';
import type { ExplorerCapabilityAction } from '../events/actions.js';
import { dispatchExplorerAction, type ExplorerActionResult } from '../events/actions.js';
import { mapCatalogToExplorer } from './model.js';
import type { SavedViewsPluginService } from '../../saved-views/helpers/service.js';
import { normalizePhysicalName } from './model.js';

export const EXPLORER_SERVICE = 'tabular.explorer';

export class ExplorerPluginService {
  readonly name = EXPLORER_SERVICE;

  constructor(
    private readonly catalog: Pick<CatalogPluginService, 'discover'>,
    private readonly files: Pick<FilesPluginService, 'plan' | 'folderPermissions' | 'displayNames'>,
    private readonly savedViews: Pick<SavedViewsPluginService, 'list'> = {
      list: async () => ({ views: [], capabilities: {}, cursor: 0 })
    }
  ) {}

  async discover(principal: BrowserPrincipal) {
    const catalog = await this.catalog.discover(principal);
    const permissions = await this.files.folderPermissions(principal);
    const snapshot = mapCatalogToExplorer(catalog, permissions);
    const fileIds = snapshot.folders.flatMap((folder) => folder.files.map((file) => file.id));
    const displayNames = await this.files.displayNames(principal, fileIds);
    const saved = await this.savedViews.list(principal, fileIds);
    return {
      ...snapshot,
      folders: snapshot.folders.map((folder) => ({
        ...folder,
        files: folder.files.map((file) => ({
          ...file,
          displayName: displayNames.get(file.id) || file.displayName,
          savedViewCapabilities: saved.capabilities[file.id]
        })),
        views: saved.views.flatMap((view) => {
          const source = folder.files.find((file) => file.id === view.fileId);
          if (!source) return [];
          const filterCount = view.definition.filters.length;
          const sortCount = view.definition.sorts.length;
          return [{
            id: view.id,
            folderId: folder.id,
            fileId: source.id,
            fileSlug: source.slug,
            slug: view.slug,
            displayName: view.name,
            sourceFileName: source.displayName,
            summary: [
              filterCount ? `${filterCount} ${filterCount === 1 ? 'filter' : 'filters'}` : '',
              sortCount ? `${sortCount} ${sortCount === 1 ? 'sort' : 'sorts'}` : ''
            ].filter(Boolean).join(' · ') || 'Saved presentation',
            access: view.access === 'private' ? 'Personal' as const : 'Shared' as const,
            updatedLabel: new Date(view.updatedAt).toLocaleString('en', {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
            })
          }];
        })
      }))
    };
  }

  plan(principal: BrowserMutationPrincipal, action: ExplorerCapabilityAction) {
    if (action.type === 'file.create.blank') {
      return this.files.plan(principal, {
        type: 'file.create',
        commandId: action.commandId,
        schemaId: action.folder.id,
        displayName: action.displayName
      });
    }
    return this.files.plan(principal, {
      type: 'file.rename',
      commandId: action.commandId,
      fileId: action.file.id,
      displayName: action.displayName,
      physicalName: action.type === 'file.settings.apply' && action.physicalNameOverridden
        ? action.physicalName
        : normalizePhysicalName(action.displayName)
    });
  }

  async dispatch(
    principal: BrowserMutationPrincipal,
    action: ExplorerCapabilityAction
  ): Promise<ExplorerActionResult> {
    const result = await dispatchExplorerAction(action);
    if (!result.ok) return result;
    if (action.type !== 'file.create.blank' && action.folder.id !== action.sourceFolder.id) {
      return {
        ok: false,
        code: 'backend_failure',
        message: 'Moving a file to another PostgreSQL schema is not supported yet.'
      };
    }
    const planned = await this.plan(principal, action);
    return {
      ...result,
      plan: planned
    };
  }
}
