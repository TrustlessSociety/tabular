import type { HttpServer } from '@stackpress/ingest/types';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import {
  renderAuthenticationRequired,
  renderProductPage
} from '../../app/helpers/rendering.js';
import { WebCapabilityAdapter } from '../../capability/events/web-adapter.js';
import type { CapabilityPluginService } from '../../capability/helpers/service.js';
import { authenticatedExplorerContext } from '../../explorer/helpers/authenticated-context.js';
import type { ExplorerPluginService } from '../../explorer/helpers/service.js';
import type { FileDdlAction } from '../../files/helpers/contracts.js';
import type { FilesPluginService } from '../../files/helpers/service.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { SavedViewDefinition } from '../../saved-views/helpers/contracts.js';
import type { SavedViewsPluginService } from '../../saved-views/helpers/service.js';
import type { GridCellValue } from '../helpers/contracts.js';
import type { GridPluginService, GridReadQuery } from '../helpers/service.js';

export const GRID_ROUTES = [
  '/pages/table.html',
  '/events/grid',
  '/events/grid-relation'
] as const;

/** Registers Grid-owned page, read, relation, and mutation routes. */
export function registerGridRoutes(
  server: HttpServer<any, any>,
  runtime: ApplicationRuntimeService,
  identity: IdentityPluginService,
  explorer: ExplorerPluginService,
  capability: CapabilityPluginService,
  files: FilesPluginService,
  savedViews: SavedViewsPluginService,
  grid: GridPluginService
) {
  server.get('/pages/table.html', async ({ req, res }) => {
    exactPageQuery(req.url.searchParams);
    const context = await authenticatedExplorerContext(
      req.session(identity.cookieName()),
      identity,
      explorer
    );
    if (!context) return renderAuthenticationRequired(res, runtime);
    const folderSlug = req.url.searchParams.get('folder') || '';
    const folder = context.snapshot.folders.find((item) => item.slug === folderSlug);
    if (!folder) {
      throw new ApplicationError(
        'grid_folder_unavailable',
        404,
        'The requested folder is unavailable'
      );
    }
    const denied = Boolean(
      !folder.permissions.renameFile || !folder.permissions.configureFile
    );
    const requestedTable = req.url.searchParams.get('table') || '';
    const newFile = req.url.searchParams.get('new') === '1';
    const file = folder.files.find((candidate) => candidate.slug === requestedTable);
    if (
      (!newFile && !file)
      || (newFile && (
        requestedTable !== 'untitled-file'
        || !folder.permissions.createFile
        || Boolean(file)
      ))
    ) {
      throw new ApplicationError(
        'grid_file_unavailable',
        404,
        'The requested file is unavailable'
      );
    }
    await renderProductPage(res, runtime, {
      surface: 'table',
      route: {
        folder: folderSlug,
        table: requestedTable,
        newFile,
        ...(req.url.searchParams.get('view')
          ? { view: req.url.searchParams.get('view')! }
          : {}),
        ...(['views', 'create'].includes(req.url.searchParams.get('dialog') || '')
          ? { dialog: req.url.searchParams.get('dialog') as 'views' | 'create' }
          : {}),
        ...(denied ? { scenario: 'denied' as const } : {})
      },
      snapshot: context.snapshot,
      identity: context.identity,
      csrfToken: context.csrfToken
    });
  });

  server.get('/events/grid', async ({ req, res }) => {
    exactGridQuery(req.url.searchParams);
    const context = await authenticatedExplorerContext(
      req.session(identity.cookieName()),
      identity,
      explorer
    );
    if (!context) {
      res.json({
        status: 'error',
        error: { code: 'invalid_session', message: 'The browser session is invalid' }
      }, 401);
      return;
    }
    res.headers.set('Cache-Control', 'no-store, private');
    res.headers.set('X-Tabular-CSRF', context.csrfToken);
    const folder = context.snapshot.folders.find((item) =>
      item.slug === req.url.searchParams.get('folder')
    );
    const file = folder?.files.find((item) =>
      item.slug === req.url.searchParams.get('table')
    );
    if (!file || file.readOnly) {
      res.json({
        status: 'unavailable',
        reason: file?.readOnly
          ? 'This PostgreSQL object is read-only.'
          : 'The requested file is unavailable.'
      }, file ? 409 : 404);
      return;
    }
    const query = await resolveGridReadQuery(
      req.url.searchParams,
      context.principal,
      file.id,
      files,
      savedViews
    );
    const resource = await grid.load(context.principal, file.id, query);
    const draftResponse = resource
      ? await new WebCapabilityAdapter(identity, capability).invoke(context.principal, {
        action: { type: 'draft.list', fileId: file.id }
      })
      : undefined;
    const drafts = draftResponse?.status === 'ok' && Array.isArray(draftResponse.data)
      ? draftResponse.data
      : [];
    res.json(resource
      ? { status: 'ok', data: { ...resource, drafts } }
      : {
        status: 'unavailable',
        reason: 'This table needs a supported non-null primary or unique key before editing.'
      }, resource ? 200 : 409);
  });

  server.get('/events/grid-relation', async ({ req, res }) => {
    const context = await authenticatedExplorerContext(
      req.session(identity.cookieName()),
      identity,
      explorer
    );
    if (!context) {
      res.json({
        status: 'error',
        error: { code: 'invalid_session', message: 'The browser session is invalid' }
      }, 401);
      return;
    }
    const allowed = new Set(['fileId', 'columnId', 'query', 'limit', 'keys']);
    if ([...req.url.searchParams.keys()].some((key) => !allowed.has(key))) {
      throw new Error('Relation lookup query is invalid');
    }
    const fileId = text(req.url.searchParams.get('fileId'), 'file ID', 80);
    const columnId = text(req.url.searchParams.get('columnId'), 'column ID', 80);
    const query = req.url.searchParams.get('query') || '';
    if (query.length > 200 || /[\u0000-\u001f\u007f]/.test(query)) {
      throw new Error('Relation lookup text is invalid');
    }
    const limit = Number(req.url.searchParams.get('limit') || '25');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('Relation lookup limit is invalid');
    }
    const selectedKeys = relationSelectedKeys(req.url.searchParams.get('keys'));
    res.headers.set('Cache-Control', 'no-store, private');
    res.headers.set('X-Tabular-CSRF', context.csrfToken);
    const result = await grid.lookupRelation(context.principal, {
      fileId,
      columnId,
      query,
      limit,
      ...(selectedKeys.length ? { selectedKeys } : {})
    });
    res.json(result
      ? { status: 'ok', data: result }
      : {
        status: 'unavailable',
        reason: 'The authorized relation lookup is unavailable.'
      }, result ? 200 : 404);
  });

  server.post('/events/grid', async ({ req, res }) => {
    requireJson(req.headers.get('content-type'));
    const principal = await identity.requireBrowserMutation({
      cookieToken: req.session(identity.cookieName()),
      csrfToken: req.headers.get('x-tabular-csrf'),
      origin: req.headers.get('origin')
    });
    const envelope = object(req.data.get('event'), 'Grid event');
    const kind = text(envelope.kind, 'grid event kind', 40);
    res.headers.set('Cache-Control', 'no-store, private');
    if (kind === 'capability') {
      exactKeys(envelope, ['kind', 'action']);
      res.json(await new WebCapabilityAdapter(identity, capability).invoke(principal, {
        action: envelope.action
      }));
      return;
    }
    if (kind === 'ddl.plan') {
      exactKeys(envelope, ['kind', 'action']);
      res.json({
        status: 'ok',
        data: await files.plan(principal, envelope.action as FileDdlAction)
      });
      return;
    }
    if (kind === 'ddl.confirm') {
      exactKeys(envelope, ['kind', 'requestId', 'confirmationToken']);
      res.json({
        status: 'ok',
        data: await files.confirm(
          principal,
          text(envelope.requestId, 'DDL request ID', 160),
          text(envelope.confirmationToken, 'DDL confirmation token', 200)
        )
      });
      return;
    }
    if (kind === 'unstructured.column.create') {
      exactKeys(envelope, ['kind', 'fileId', 'count']);
      const count = Number(envelope.count);
      if (!Number.isSafeInteger(count) || count < 1 || count > 12) {
        throw new Error('Unstructured column count is invalid');
      }
      const fileId = text(envelope.fileId, 'file ID', 80);
      const created = [];
      for (let index = 0; index < count; index += 1) {
        created.push(await files.createUnstructuredColumn(principal, {
          fileId,
          displayName: '',
          field: 'text',
          format: 'plain-text'
        }));
      }
      res.json({
        status: 'ok',
        data: created
      });
      return;
    }
    throw new Error('Grid event kind is unsupported');
  });
}

/** Rejects review-only and ambiguous table-page query state. */
function exactPageQuery(parameters: URLSearchParams) {
  const allowed = new Set(['folder', 'table', 'new', 'view', 'dialog']);
  if (
    [...parameters.keys()].some((key) => !allowed.has(key))
    || [...allowed].some((key) => parameters.getAll(key).length > 1)
    || (parameters.has('new') && parameters.get('new') !== '1')
  ) {
    throw new ApplicationError(
      'invalid_grid_query',
      400,
      'The table page query is invalid'
    );
  }
}

/** Resolves saved and transient view state into one server-authorized grid query. */
export async function resolveGridReadQuery(
  parameters: URLSearchParams,
  principal: Parameters<SavedViewsPluginService['get']>[0],
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
      throw new ApplicationError(
        'invalid_grid_query',
        400,
        'The saved-view version is invalid'
      );
    }
    const resolved = await savedViews.get(
      principal,
      text(viewId, 'saved-view ID', 80)
    );
    if (resolved.fileId !== fileId) {
      throw new ApplicationError(
        'grid_view_unavailable',
        404,
        'The saved view is unavailable'
      );
    }
    if (resolved.version !== expectedVersion) {
      throw new ApplicationError(
        'saved_view_conflict',
        409,
        'The saved view changed; reload before reading it'
      );
    }
    definition = resolved.definition;
    view = { id: resolved.id, version: resolved.version, definition: resolved.definition };
  }

  const columns = definition?.includes.columnLayout
    ? definition.columnOrder.filter((columnId) =>
      !definition!.hiddenColumnIds.includes(columnId)
    )
    : visibleColumnIds;
  const definitionSorts = definition?.includes.filtersAndSorting ? definition.sorts : [];
  const definitionFilters = definition?.includes.filtersAndSorting ? definition.filters : [];
  const transientSortColumn = sortColumnId
    ? text(sortColumnId, 'sort column ID', 80)
    : undefined;
  if (
    !columns.length
    || columns.some((columnId) => !visibleColumns.has(columnId))
    || definitionSorts.some((sort) => !visibleColumns.has(sort.columnId))
    || definitionFilters.some((filter) => !visibleColumns.has(filter.columnId))
    || (transientSortColumn && !visibleColumns.has(transientSortColumn))
  ) {
    throw new ApplicationError(
      'grid_view_unavailable',
      409,
      'The grid query references a column that is no longer visible'
    );
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

function exactGridQuery(parameters: URLSearchParams) {
  const allowed = new Set([
    'folder',
    'table',
    'viewId',
    'expectedViewVersion',
    'sortColumnId',
    'sortDirection'
  ]);
  if (
    [...parameters.keys()].some((key) => !allowed.has(key))
    || [...allowed].some((key) => parameters.getAll(key).length > 1)
  ) {
    throw new ApplicationError('invalid_grid_query', 400, 'The grid query is invalid');
  }
}

function relationSelectedKeys(value: string | null): GridCellValue[][] {
  if (!value) return [];
  if (value.length > 12_000) throw new Error('Relation lookup keys are invalid');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Relation lookup keys are invalid');
  }
  if (!Array.isArray(parsed) || parsed.length > 50) {
    throw new Error('Relation lookup keys are invalid');
  }
  return parsed.map((tuple) => {
    if (!Array.isArray(tuple) || !tuple.length || tuple.length > 8) {
      throw new Error('Relation lookup keys are invalid');
    }
    return tuple.map((item) => {
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (
        typeof item === 'string'
        && item.length <= 200
        && !/[\u0000-\u001f\u007f]/.test(item)
      ) {
        return item;
      }
      throw new Error('Relation lookup keys are invalid');
    });
  });
}

function exactKeys(value: Record<string, unknown>, allowed: string[]) {
  const keys = new Set(allowed);
  if (
    Object.keys(value).some((key) => !keys.has(key))
    || allowed.some((key) => !(key in value))
  ) {
    throw new Error('The action envelope is invalid');
  }
}

function object(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  if (!/^[A-Za-z0-9_.:-]+$/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function requireJson(contentType: string | string[] | undefined) {
  if (
    typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new Error('Grid actions require JSON');
  }
}
