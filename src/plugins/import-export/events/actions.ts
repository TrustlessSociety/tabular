//client
import type { GridCellPresentation } from '../../grid/helpers/contracts.js';
import type { SavedViewDefinition } from '../../saved-views/helpers/contracts.js';
import {
  browserCsrfToken,
  rememberBrowserCsrfToken
} from '../../identity/events/browser-csrf.js';

//The browser import column mapping contract exported for module callers
export type BrowserImportColumnMapping = {
  sourceColumn: number,
  sourceName: string,
  displayName: string,
  physicalName: string,
  storageType: 'text' | 'bigint' | 'numeric' | 'boolean' | 'date' | 'time' | 'timestamptz' | 'jsonb',
  field?: import('../../files/helpers/contracts.js').FileFieldKind,
  include: boolean,
};

//The browser import operation contract exported for module callers
export type BrowserImportOperation = {
  id: string,
  source: {
    kind: 'csv' | 'xlsx' | 'google-sheets',
    name: string,
    mediaType: string,
    size: number,
    receivedChunks: number,
    totalChunks: number,
    sha256?: string,
    selectedSheet?: string,
    options: Record<string, unknown>,
  },
  folder: { id: string, name: string, },
  headers: unknown[],
  mapping: BrowserImportColumnMapping[],
  preview: Array<Array<string | null>>,
  warnings: Array<Record<string, unknown>>,
  issues?: Array<{
    rowNumber?: number,
    columnNumber?: number,
    code: string,
    message: string,
  }>,
  counts: { rows: number, columns: number, issues: number, },
  identity: { fileName: string, tableName: string, folder: string, },
  state: 'initiated' | 'uploading' | 'preview' | 'ready' | 'confirmed'
    | 'committing' | 'committed' | 'cancelled' | 'failed',
  version: number,
  result?: Record<string, unknown>,
  error?: Record<string, unknown>,
  expiresAt: string,
  updatedAt: string,
};

//The import browser result contract exported for module callers
export type ImportBrowserResult<T> =
  | { status: 'ok', data: T, }
  | { status: 'error', error: { code: string, message: string, }, };

//The import mutation contract exported for module callers
export type ImportMutation =
  | {
    type: 'import.mapping',
    importId: string,
    mapping: BrowserImportColumnMapping[],
    fileDisplayName: string,
    tableName: string,
  }
  | { type: 'import.sheet', importId: string, sheetName: string, }
  | { type: 'import.prepare-confirmation', importId: string, }
  | { type: 'import.confirm', importId: string, confirmationToken: string, }
  | { type: 'import.cancel', importId: string, }
  | { type: 'import.retry', importId: string, }
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
  | { type: 'google.connection.revoke', };

//The google spreadsheet choice contract exported for module callers
export type GoogleSpreadsheetChoice = {
  id: string,
  name: string,
  modifiedTime: string,
  version: string,
};

//The csv export browser request contract exported for module callers
export type CsvExportBrowserRequest = {
  type: 'export.csv',
  fileId: string,
  viewId?: string,
  expectedViewVersion?: number,
  columnIds?: string[],
  sorts?: SavedViewDefinition['sorts'],
  filters?: SavedViewDefinition['filters'],
  presentation?: Record<string, GridCellPresentation>,
};

/**
 * Return the upload import source result.
 */
export async function uploadImportSource(input: {
  folderId: string,
  kind: 'csv' | 'xlsx',
  file: File,
  commandId: string,
  csrfToken: string,
}): Promise<ImportBrowserResult<BrowserImportOperation>> {
  try {
    const query = new URLSearchParams({
      folderId: input.folderId,
      kind: input.kind,
      name: input.file.name,
      commandId: input.commandId
    });
    const response = await fetch(`/events/import-source?${query}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': input.file.type || mediaType(input.kind),
        'X-Tabular-CSRF': browserCsrfToken(input.csrfToken)
      },
      body: input.file
    });
    return await jsonResult<BrowserImportOperation>(response, 'The source could not be imported.');
  } catch {
    return networkFailure('The source could not be uploaded. Your selected file was retained.');
  }
}

/**
 * Load the import operation.
 */
export async function loadImportOperation(
  importId: string
): Promise<ImportBrowserResult<BrowserImportOperation>> {
  try {
    const response = await fetch(`/events/import-export?${new URLSearchParams({ importId })}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    return await jsonResult<BrowserImportOperation>(response, 'Import status is unavailable.');
  } catch {
    return networkFailure('Import status is unavailable.');
  }
}

/**
 * Load the google import availability.
 */
export async function loadGoogleImportAvailability(): Promise<ImportBrowserResult<{
  available: boolean,
  reason?: string,
  missing: string[],
}>> {
  try {
    const response = await fetch('/events/import-export?googleAvailability=1', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    return await jsonResult(response, 'Google Sheets availability is unknown.');
  } catch {
    return networkFailure('Google Sheets availability is unknown.');
  }
}

/**
 * Dispatch the import mutation.
 */
export async function dispatchImportMutation<T = BrowserImportOperation>(
  action: ImportMutation,
  csrfToken: string
): Promise<ImportBrowserResult<T>> {
  try {
    const response = await fetch('/events/import-export', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tabular-CSRF': browserCsrfToken(csrfToken)
      },
      body: JSON.stringify({ action })
    });
    return await jsonResult<T>(response, 'The import change could not be completed.');
  } catch {
    return networkFailure('The server could not be reached. The import review was retained.');
  }
}

/**
 * Start the google OAuth.
 */
export function startGoogleOAuth(returnPath: string, csrfToken: string) {
  return dispatchImportMutation<{ authorizationUrl: string, expiresAt: string, }>({
    type: 'google.oauth.start', returnPath
  }, csrfToken);
}

/**
 * List the google spreadsheets.
 */
export function listGoogleSpreadsheets(csrfToken: string, pageToken?: string) {
  return dispatchImportMutation<{
    files: GoogleSpreadsheetChoice[],
    nextPageToken?: string,
  }>({ type: 'google.spreadsheets.list', ...(pageToken ? { pageToken } : {}) }, csrfToken);
}

/**
 * List the google worksheets.
 */
export function listGoogleWorksheets(spreadsheetId: string, csrfToken: string) {
  return dispatchImportMutation<{ spreadsheetId: string, sheets: string[], }>({
    type: 'google.worksheets.list', spreadsheetId
  }, csrfToken);
}

/**
 * Return the stage google import result.
 */
export function stageGoogleImport(input: {
  commandId: string,
  folderId: string,
  spreadsheetId: string,
  sheetName: string,
}, csrfToken: string) {
  return dispatchImportMutation<BrowserImportOperation>({
    type: 'google.import.stage', ...input
  }, csrfToken);
}

/**
 * Return the download authorized CSV result.
 */
export async function downloadAuthorizedCsv(
  action: CsvExportBrowserRequest,
  csrfToken: string
): Promise<ImportBrowserResult<{ blob: Blob, filename: string, rows: number, }>> {
  try {
    const response = await fetch('/events/import-export', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'text/csv, application/json',
        'Content-Type': 'application/json',
        'X-Tabular-CSRF': browserCsrfToken(csrfToken)
      },
      body: JSON.stringify({ action })
    });
    if (!response.ok) return await jsonResult(response, 'The CSV export could not be completed.');
    return {
      status: 'ok',
      data: {
        blob: await response.blob(),
        filename: dispositionFilename(response.headers.get('content-disposition')),
        rows: Number(response.headers.get('x-tabular-export-rows') || 0)
      }
    };
  } catch {
    return networkFailure('The server could not be reached. No CSV was downloaded.');
  }
}

/**
 * Return the JSON result result.
 */
async function jsonResult<T>(response: Response, fallback: string): Promise<ImportBrowserResult<T>> {
  const result = await response.json() as ImportBrowserResult<T> | {
    error?: { code?: string, message?: string, },
  };
  if (!response.ok || !('status' in result) || result.status !== 'ok') {
    return {
      status: 'error',
      error: {
        code: 'error' in result && result.error?.code || 'request_failed',
        message: 'error' in result && result.error?.message || fallback
      }
    };
  }
  return result;
}

/**
 * Return the disposition filename result.
 */
function dispositionFilename(value: string | null) {
  const encoded = value?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* use ASCII fallback */ }
  }
  return value?.match(/filename="([^"]+)"/i)?.[1] || 'tabular-export.csv';
}

/**
 * Return the media type result.
 */
function mediaType(kind: 'csv' | 'xlsx') {
  return kind === 'csv'
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

/**
 * Return the network failure result.
 */
function networkFailure<T>(message: string): ImportBrowserResult<T> {
  return { status: 'error', error: { code: 'network_failure', message } };
}
