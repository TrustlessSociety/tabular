//client
import type {
  ExplorerCatalogSource,
  ExplorerFile,
  ExplorerFolder,
  ExplorerFolderPermissions,
  ExplorerSavedView,
  ExplorerSnapshot
} from './contracts.js';

/**
 * Map the catalog to explorer.
 */
export function mapCatalogToExplorer(
  catalog: ExplorerCatalogSource,
  permissions: ReadonlyMap<string, ExplorerFolderPermissions> = new Map()
): ExplorerSnapshot {
  const connection = catalog.connections[0];
  const database = catalog.databases.find((item) => item.connectionId === connection?.id);
  if (!connection || !database) throw new Error('Explorer catalog needs one visible connection and database');
  const folders = catalog.schemas.map((schema) => {
    const mappedFiles = schema.files.map((catalogFile) => ({
      id: catalogFile.id,
      folderId: schema.id,
      slug: slugify(catalogFile.name),
      displayName: humanize(catalogFile.name),
      physicalName: catalogFile.name,
      kind: catalogFile.kind,
      readOnly: catalogFile.readOnly,
      columnCount: catalogFile.columns.length
    }));
    return {
      id: schema.id,
      databaseId: database.id,
      slug: slugify(schema.name),
      displayName: humanize(schema.name),
      permissions: permissions.get(schema.id) || {
        createFile: false,
        importFile: false,
        renameFile: false,
        configureFile: false
      },
      files: mappedFiles,
      views: []
    } satisfies ExplorerFolder;
  });
  return {
    connection: { id: connection.id, displayName: humanize(connection.id) },
    database: { id: database.id, connectionId: database.connectionId, displayName: database.name },
    folders
  };
}

/**
 * Filter the explorer items.
 */
export function filterExplorerItems<T>(items: T[], query: string, searchable: (item: T) => string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return items;
  return items.filter((item) => searchable(item).toLocaleLowerCase().includes(normalized));
}

/**
 * Reconcile the explorer selection.
 */
export function reconcileExplorerSelection(selectedId: string | null, availableIds: Iterable<string>) {
  if (!selectedId) return null;
  return new Set(availableIds).has(selectedId) ? selectedId : null;
}

/**
 * Normalize the physical name.
 */
export function normalizePhysicalName(displayName: string) {
  const normalized = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return normalized || 'untitled_file';
}

/**
 * Return the duplicate display name result.
 */
export function duplicateDisplayName(
  files: ExplorerFile[],
  displayName: string,
  currentId?: string
) {
  const wanted = displayName.trim().toLocaleLowerCase();
  return files.some((item) => item.id !== currentId && item.displayName.toLocaleLowerCase() === wanted);
}

/**
 * Return the slugify result.
 */
function slugify(value: string) {
  return value.toLocaleLowerCase().replace(/_/g, '-').replace(/[^a-z0-9-]+/g, '-');
}

/**
 * Return the humanize result.
 */
function humanize(value: string) {
  const words = value.replace(/[_-]+/g, ' ').trim();
  return words ? words[0]!.toLocaleUpperCase() + words.slice(1) : value;
}
