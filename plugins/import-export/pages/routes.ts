//client
import type {
  ApplicationRuntimeService,
  ApplicationServer
} from '../../../bootstrap/application.js';
import type { ExplorerPluginService } from '../../explorer/helpers/service.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { SavedViewDefinition } from '../../saved-views/helpers/contracts.js';
import type { ImportExportPluginService } from '../helpers/service.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import {
  renderAuthenticationRequired,
  renderProductPage
} from '../../app/helpers/rendering.js';
import { authenticatedExplorerContext } from '../../explorer/helpers/authenticated-context.js';
import { EXPLORER_SERVICE } from '../../explorer/helpers/service.js';
import { validateDefinition } from '../../saved-views/helpers/validation.js';

//The import export routes value exported for module callers
export const IMPORT_EXPORT_ROUTES = [
  '/pages/import.html',
  '/events/import-export',
  '/events/import-source',
  '/events/import-google-callback'
] as const;

/**
 * Register the import export routes.
 */
export function registerImportExportRoutes(
  //Stackpress resolves installed services dynamically, so this route boundary
  // cannot name a complete static service map yet
  server: ApplicationServer,
  runtime: ApplicationRuntimeService,
  identity: IdentityPluginService,
  importExport: ImportExportPluginService
) {
  server.get('/pages/import.html', async ({ req, res }) => {
    exactQuery(req.url.searchParams, ['folder']);
    const explorer = server.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
    if (!explorer) {
      throw new ApplicationError(
        'service_starting',
        503,
        'Explorer service is starting'
      );
    }
    const context = await authenticatedExplorerContext(
      req.session(identity.cookieName()),
      identity,
      explorer
    );
    if (!context) return renderAuthenticationRequired(res, runtime);
    const requestedFolder = req.url.searchParams.get('folder');
    const folder = context.snapshot.folders.find((candidate) =>
      candidate.slug === requestedFolder
    );
    if (!requestedFolder || !folder) {
      throw new ApplicationError(
        'import_folder_unavailable',
        404,
        'The requested import folder is unavailable'
      );
    }
    await renderProductPage(res, runtime, {
      surface: 'import-entry',
      route: { folder: folder.slug },
      snapshot: context.snapshot,
      identity: context.identity,
      csrfToken: context.csrfToken
    });
  });

  server.get('/events/import-google-callback', async ({ req, res }) => {
    exactQuery(req.url.searchParams, [
      'state', 'code', 'error', 'error_description', 'scope', 'authuser', 'prompt', 'hd'
    ]);
    const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
    if (!resumed) invalidSession();
    const result = await importExport.completeGoogleOAuth(resumed.principal, {
      state: providerToken(req.url.searchParams.get('state'), 'Google OAuth state', 512),
      ...(req.url.searchParams.get('code')
        ? { code: providerToken(req.url.searchParams.get('code'), 'Google OAuth code', 2_048) } : {}),
      ...(req.url.searchParams.get('error')
        ? { error: providerToken(req.url.searchParams.get('error'), 'Google OAuth error', 200) } : {})
    });
    const target = new URL(result.returnPath, 'http://tabular.invalid');
    target.searchParams.set('google', result.status);
    res.headers.set('Cache-Control', 'no-store, private');
    res.redirect(`${target.pathname}${target.search}`, 303);
  });

  server.get('/events/import-export', async ({ req, res }) => {
    exactQuery(req.url.searchParams, ['importId', 'googleAvailability']);
    const resumed = await identity.resumeBrowserSession(req.session(identity.cookieName()));
    if (!resumed) invalidSession();
    res.headers.set('Cache-Control', 'no-store, private');
    res.headers.set('X-Tabular-CSRF', resumed.csrfToken);
    if (req.url.searchParams.get('googleAvailability') === '1') {
      res.json({ status: 'ok', data: importExport.googleSheetsAvailability() });
      return;
    }
    const importId = req.url.searchParams.get('importId');
    if (!importId) invalid('Import identity is required');
    res.json({ status: 'ok', data: await importExport.get(resumed.principal, importId) });
  });

  server.post('/events/import-export', async ({ req, res }) => {
    requireJson(req.headers.get('content-type'));
    const principal = await identity.requireBrowserMutation({
      cookieToken: req.session(identity.cookieName()),
      csrfToken: req.headers.get('x-tabular-csrf'),
      origin: req.headers.get('origin')
    });
    const action = actionInput(req.data.get('action'));
    res.headers.set('Cache-Control', 'no-store, private');
    if (action.type === 'google.oauth.start') {
      res.json({
        status: 'ok',
        data: await importExport.startGoogleOAuth(principal, action.returnPath)
      });
      return;
    }
    if (action.type === 'google.spreadsheets.list') {
      res.json({
        status: 'ok',
        data: await importExport.listGoogleSpreadsheets(principal, action.pageToken)
      });
      return;
    }
    if (action.type === 'google.worksheets.list') {
      res.json({
        status: 'ok',
        data: await importExport.listGoogleWorksheets(principal, action.spreadsheetId)
      });
      return;
    }
    if (action.type === 'google.import.stage') {
      res.json({ status: 'ok', data: await importExport.stageGoogleImport(principal, action) });
      return;
    }
    if (action.type === 'google.connection.revoke') {
      res.json({ status: 'ok', data: await importExport.revokeGoogleConnection(principal) });
      return;
    }
    if (action.type === 'import.mapping') {
      res.json({ status: 'ok', data: await importExport.updateMapping(principal, action) });
      return;
    }
    if (action.type === 'import.sheet') {
      res.json({
        status: 'ok',
        data: await importExport.finalizeSource(principal, action.importId, {
          sheetName: action.sheetName
        })
      });
      return;
    }
    if (action.type === 'import.prepare-confirmation') {
      res.json({
        status: 'ok',
        data: await importExport.prepareConfirmation(principal, action.importId)
      });
      return;
    }
    if (action.type === 'import.confirm') {
      res.json({
        status: 'ok',
        data: await importExport.confirm(principal, action.importId, action.confirmationToken)
      });
      return;
    }
    if (action.type === 'import.cancel') {
      res.json({ status: 'ok', data: await importExport.cancel(principal, action.importId) });
      return;
    }
    if (action.type === 'import.retry') {
      res.json({ status: 'ok', data: await importExport.retry(principal, action.importId) });
      return;
    }
    const csv = await importExport.exportCsv(principal, action);
    res.headers.set('Content-Disposition', csv.contentDisposition);
    res.headers.set('X-Tabular-Export-Rows', String(csv.rowCount));
    res.headers.set('X-Tabular-Export-Columns', String(csv.columnCount));
    res.headers.set('X-Tabular-Sanitized-Cells', String(csv.sanitizedCells));
    res.set(csv.contentType, csv.bytes, 200);
  });
}

type ImportAction =
  | { type: 'google.oauth.start', returnPath: string, }
  | { type: 'google.spreadsheets.list', pageToken?: string, }
  | { type: 'google.worksheets.list', spreadsheetId: string, }
  | {
    type: 'google.import.stage',
    commandId: string,
    folderId: string,
    spreadsheetId: string,
    sheetName: string,
  }
  | { type: 'google.connection.revoke', }
  | {
    type: 'import.mapping',
    importId: string,
    mapping: unknown,
    fileDisplayName: string,
    tableName: string,
  }
  | { type: 'import.sheet', importId: string, sheetName: string, }
  | { type: 'import.prepare-confirmation', importId: string, }
  | { type: 'import.confirm', importId: string, confirmationToken: string, }
  | { type: 'import.cancel', importId: string, }
  | { type: 'import.retry', importId: string, }
  | {
    type: 'export.csv',
    fileId: string,
    viewId?: string,
    expectedViewVersion?: number,
    columnIds?: string[],
    sorts?: SavedViewDefinition['sorts'],
    filters?: SavedViewDefinition['filters'],
    presentation?: SavedViewDefinition['presentation'],
  };

/**
 * Return the action input result.
 */
function actionInput(value: unknown): ImportAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Import/export action is invalid');
  const action = value as Record<string, unknown>;
  if (action.type === 'google.oauth.start') {
    exact(action, ['type', 'returnPath']);
    return {
      type: action.type,
      returnPath: returnPath(action.returnPath)
    };
  }
  if (action.type === 'google.spreadsheets.list') {
    exact(action, ['type', 'pageToken']);
    return {
      type: action.type,
      ...(typeof action.pageToken === 'string'
        ? { pageToken: providerToken(action.pageToken, 'Google page token', 2_048) }
        : {})
    };
  }
  if (action.type === 'google.worksheets.list') {
    exact(action, ['type', 'spreadsheetId']);
    return {
      type: action.type,
      spreadsheetId: providerIdentifier(action.spreadsheetId, 'Google spreadsheet identity')
    };
  }
  if (action.type === 'google.import.stage') {
    exact(action, ['type', 'commandId', 'folderId', 'spreadsheetId', 'sheetName']);
    return {
      type: action.type,
      commandId: bounded(action.commandId, 'command identity', 100),
      folderId: bounded(action.folderId, 'folder identity', 80),
      spreadsheetId: providerIdentifier(action.spreadsheetId, 'Google spreadsheet identity'),
      sheetName: bounded(action.sheetName, 'worksheet name', 100, true)
    };
  }
  if (action.type === 'google.connection.revoke') {
    exact(action, ['type']);
    return { type: action.type };
  }
  if (action.type === 'import.mapping') {
    exact(action, ['type', 'importId', 'mapping', 'fileDisplayName', 'tableName']);
    return {
      type: action.type,
      importId: bounded(action.importId, 'import identity', 80),
      mapping: action.mapping,
      fileDisplayName: bounded(action.fileDisplayName, 'file name', 200, true),
      tableName: bounded(action.tableName, 'table name', 63)
    };
  }
  if (action.type === 'import.sheet') {
    exact(action, ['type', 'importId', 'sheetName']);
    return {
      type: action.type,
      importId: bounded(action.importId, 'import identity', 80),
      sheetName: bounded(action.sheetName, 'worksheet name', 31, true)
    };
  }
  if (action.type === 'import.prepare-confirmation'
    || action.type === 'import.cancel'
    || action.type === 'import.retry') {
    exact(action, ['type', 'importId']);
    return { type: action.type, importId: bounded(action.importId, 'import identity', 80) };
  }
  if (action.type === 'import.confirm') {
    exact(action, ['type', 'importId', 'confirmationToken']);
    return {
      type: action.type,
      importId: bounded(action.importId, 'import identity', 80),
      confirmationToken: bounded(action.confirmationToken, 'confirmation token', 200)
    };
  }
  if (action.type === 'export.csv') {
    exact(action, [
      'type', 'fileId', 'viewId', 'expectedViewVersion',
      'columnIds', 'sorts', 'filters', 'presentation'
    ]);
    const columnIds = typeof action.columnIds !== 'undefined'
      ? stringArray(action.columnIds, 'export columns', 200)
      : [];
    const provisionalSorts = typeof action.sorts === 'undefined' ? [] : action.sorts;
    const provisionalFilters = typeof action.filters === 'undefined' ? [] : action.filters;
    const provisionalPresentation = typeof action.presentation === 'undefined'
      ? {} : record(action.presentation, 'export presentation');
    const referencedColumns = new Set(columnIds);
    for (const entry of [...array(provisionalSorts, 'export sorts', 16),
      ...array(provisionalFilters, 'export filters', 32)]) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)
        && typeof (entry as Record<string, unknown>).columnId === 'string') {
        referencedColumns.add((entry as Record<string, unknown>).columnId as string);
      }
    }
    for (const key of Object.keys(provisionalPresentation)) {
      try {
        const point = JSON.parse(key) as unknown;
        if (Array.isArray(point) && typeof point[1] === 'string') referencedColumns.add(point[1]);
      } catch {
        invalid('export presentation is invalid');
      }
    }
    let exportState;
    try {
      exportState = validateDefinition({
        schemaVersion: 1,
        columnOrder: [...referencedColumns],
        hiddenColumnIds: [],
        sorts: provisionalSorts,
        filters: provisionalFilters,
        presentation: provisionalPresentation,
        includes: {
          filtersAndSorting: true,
          columnLayout: true,
          cellPresentation: true
        }
      });
    } catch {
      invalid('CSV export state is invalid');
    }
    return {
      type: action.type,
      fileId: bounded(action.fileId, 'file identity', 80),
      ...(typeof action.viewId !== 'undefined'
        ? { viewId: bounded(action.viewId, 'view identity', 80) } : {}),
      ...(typeof action.expectedViewVersion !== 'undefined'
        ? { expectedViewVersion: positive(action.expectedViewVersion, 'saved-view version') } : {}),
      ...(typeof action.columnIds !== 'undefined' ? { columnIds } : {}),
      ...(typeof action.sorts !== 'undefined' ? { sorts: exportState.sorts } : {}),
      ...(typeof action.filters !== 'undefined' ? { filters: exportState.filters } : {}),
      ...(typeof action.presentation !== 'undefined'
        ? { presentation: exportState.presentation } : {})
    };
  }
  invalid('Import/export action type is invalid');
}

/**
 * Return the exact result.
 */
function exact(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid('Import/export action has an unsupported property');
}

/**
 * Return the exact query result.
 */
function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))) invalid('Import/export query is invalid');
}

/**
 * Return the bounded result.
 */
function bounded(value: unknown, label: string, maximum: number, spaces = false) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)
    || (!spaces && !/^[A-Za-z0-9_.:-]+$/.test(value))) invalid(`${label} is invalid`);
  return value;
}

/**
 * Return the positive result.
 */
function positive(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalid(`${label} is invalid`);
  return Number(value);
}

/**
 * Return the return path result.
 */
function returnPath(value: unknown) {
  if (typeof value !== 'string' || value.length < 18 || value.length > 500
    || /[\u0000-\u001f\u007f]/.test(value)) invalid('Google return path is invalid');
  return value;
}

/**
 * Return the provider identifier result.
 */
function providerIdentifier(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{10,256}$/.test(value)) invalid(`${label} is invalid`);
  return value;
}

/**
 * Return the provider token result.
 */
function providerToken(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || /[\u0000-\u0020\u007f]/.test(value)) invalid(`${label} is invalid`);
  return value;
}

/**
 * Return the string array result.
 */
function stringArray(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) invalid(`${label} are invalid`);
  return value.map((item) => bounded(item, label, 100));
}

/**
 * Return the array result.
 */
function array(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) invalid(`${label} are invalid`);
  return value;
}

/**
 * Return the record result.
 */
function record(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} is invalid`);
  return value as Record<string, unknown>;
}

/**
 * Return the require JSON result.
 */
function requireJson(contentType: string | string[] | undefined) {
  if (typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new ApplicationError('invalid_content_type', 415, 'A JSON request is required');
  }
}

/**
 * Return the invalid result.
 */
function invalid(message: string): never {
  throw new ApplicationError('invalid_import_export_action', 400, message);
}

/**
 * Report the invalid session condition.
 */
function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}
