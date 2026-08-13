//client
import type { SavedViewDefinition } from '../../saved-views/helpers/contracts.js';
import type { SavedViewsPluginService } from '../../saved-views/helpers/service.js';
import type { FilesPluginService } from '../../files/helpers/service.js';
import type { BrowserPrincipal } from '../../identity/helpers/contracts.js';
import type { GridReadQuery } from './service.js';
import { ApplicationError } from '../../../bootstrap/errors.js';

/**
 * Resolve saved and transient view state into one server-authorized grid query.
 */
export async function resolveGridReadQuery(
  parameters: URLSearchParams,
  principal: BrowserPrincipal,
  fileId: string,
  files: Pick<FilesPluginService, 'describe'>,
  savedViews: Pick<SavedViewsPluginService, 'get'>
): Promise<GridReadQuery | undefined> {
  const viewId = parameters.get('viewId');
  const versionToken = parameters.get('expectedViewVersion');
  const sortColumnId = parameters.get('sortColumnId');
  const sortDirection = parameters.get('sortDirection');
  const typedSortDirection = sortDirection === 'asc' || sortDirection === 'desc'
    ? sortDirection
    : undefined;
  if (Boolean(viewId) !== Boolean(versionToken)) {
    throw new ApplicationError(
      'invalid_grid_query',
      400,
      'Saved-view identity and version must be provided together'
    );
  }
  if (
    Boolean(sortColumnId) !== Boolean(sortDirection)
    || (sortDirection && !typedSortDirection)
  ) {
    throw new ApplicationError('invalid_grid_query', 400, 'The grid sort is invalid');
  }
  if (!viewId && !sortColumnId) return undefined;

  const description = await files.describe(principal, fileId);
  const visibleColumnIds = description.columns
    .filter((column) => !column.hidden)
    .map((column) => column.id);
  const visibleColumns = new Set(visibleColumnIds);
  let definition: SavedViewDefinition | undefined;
  let view: GridReadQuery['view'];
  if (viewId && versionToken) {
    const expectedVersion = Number(versionToken);
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ApplicationError('invalid_grid_query', 400, 'The saved-view version is invalid');
    }
    const resolved = await savedViews.get(principal, text(viewId, 'saved-view ID', 80));
    if (resolved.fileId !== fileId) {
      throw new ApplicationError('grid_view_unavailable', 404, 'The saved view is unavailable');
    }
    if (resolved.version !== expectedVersion) {
      throw new ApplicationError('saved_view_conflict', 409, 'The saved view changed; reload before reading it');
    }
    definition = resolved.definition;
    view = { id: resolved.id, version: resolved.version, definition: resolved.definition };
  }

  const columns = definition?.includes.columnLayout
    ? definition.columnOrder.filter((columnId) => !definition!.hiddenColumnIds.includes(columnId))
    : visibleColumnIds;
  const definitionSorts = definition?.includes.filtersAndSorting ? definition.sorts : [];
  const definitionFilters = definition?.includes.filtersAndSorting ? definition.filters : [];
  const transientSortColumn = sortColumnId ? text(sortColumnId, 'sort column ID', 80) : undefined;
  if (
    !columns.length
    || columns.some((columnId) => !visibleColumns.has(columnId))
    || definitionSorts.some((sort) => !visibleColumns.has(sort.columnId))
    || definitionFilters.some((filter) => !visibleColumns.has(filter.columnId))
    || (transientSortColumn && !visibleColumns.has(transientSortColumn))
  ) {
    throw new ApplicationError('grid_view_unavailable', 409, 'The grid query references a column that is no longer visible');
  }
  return {
    columnIds: columns,
    sorts: transientSortColumn && typedSortDirection
      ? [{ columnId: transientSortColumn, direction: typedSortDirection }]
      : definitionSorts,
    filters: definitionFilters,
    ...(view ? { view } : {})
  };
}

function text(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || !/^[A-Za-z0-9_.:-]+$/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}
