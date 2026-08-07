//client
import type { SavedViewDefinition } from '../../saved-views/helpers/contracts.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { validateDefinition } from '../../saved-views/helpers/validation.js';

export type ImportAction =
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
 * Parse the import/export action contract.
 */
export function actionInput(value: unknown): ImportAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Import/export action is invalid');
  const action = value as Record<string, unknown>;
  if (action.type === 'google.oauth.start') {
    exact(action, ['type', 'returnPath']);
    return { type: action.type, returnPath: returnPath(action.returnPath) };
  }
  if (action.type === 'google.spreadsheets.list') {
    exact(action, ['type', 'pageToken']);
    return {
      type: action.type,
      ...(typeof action.pageToken === 'string'
        ? { pageToken: providerToken(action.pageToken, 'Google page token', 2_048) } : {})
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
      ? stringArray(action.columnIds, 'export columns', 200) : [];
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
        includes: { filtersAndSorting: true, columnLayout: true, cellPresentation: true }
      });
    } catch {
      invalid('CSV export state is invalid');
    }
    return {
      type: action.type,
      fileId: bounded(action.fileId, 'file identity', 80),
      ...(typeof action.viewId !== 'undefined' ? { viewId: bounded(action.viewId, 'view identity', 80) } : {}),
      ...(typeof action.expectedViewVersion !== 'undefined'
        ? { expectedViewVersion: positive(action.expectedViewVersion, 'saved-view version') } : {}),
      ...(typeof action.columnIds !== 'undefined' ? { columnIds } : {}),
      ...(typeof action.sorts !== 'undefined' ? { sorts: exportState.sorts } : {}),
      ...(typeof action.filters !== 'undefined' ? { filters: exportState.filters } : {}),
      ...(typeof action.presentation !== 'undefined' ? { presentation: exportState.presentation } : {})
    };
  }
  invalid('Import/export action type is invalid');
}

export function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))) invalid('Import/export query is invalid');
}

export function requireJson(contentType: string | string[] | undefined) {
  if (typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new ApplicationError('invalid_content_type', 415, 'A JSON request is required');
  }
}

export function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}

export function providerToken(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || /[\u0000-\u0020\u007f]/.test(value)) invalid(`${label} is invalid`);
  return value;
}

function exact(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid('Import/export action has an unsupported property');
}

function bounded(value: unknown, label: string, maximum: number, spaces = false) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)
    || (!spaces && !/^[A-Za-z0-9_.:-]+$/.test(value))) invalid(`${label} is invalid`);
  return value;
}

function positive(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) invalid(`${label} is invalid`);
  return Number(value);
}

function returnPath(value: unknown) {
  if (typeof value !== 'string' || value.length < 18 || value.length > 500
    || /[\u0000-\u001f\u007f]/.test(value)) invalid('Google return path is invalid');
  return value;
}

function providerIdentifier(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{10,256}$/.test(value)) invalid(`${label} is invalid`);
  return value;
}

function stringArray(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) invalid(`${label} are invalid`);
  return value.map((item) => bounded(item, label, 100));
}

function array(value: unknown, label: string, maximum: number) {
  if (!Array.isArray(value) || value.length > maximum) invalid(`${label} are invalid`);
  return value;
}

function record(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} is invalid`);
  return value as Record<string, unknown>;
}

export function invalid(message: string): never {
  throw new ApplicationError('invalid_import_export_action', 400, message);
}
