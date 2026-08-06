//client
import type { CapabilityAction } from '../../capability/helpers/action-contracts.js';
import type {
  ConfirmedFileDdl,
  FileDdlAction,
  PlannedFileDdl
} from '../../files/helpers/contracts.js';
import type { FileDescription } from '../../files/helpers/contracts.js';
import type {
  GridCellValue,
  GridRelationLookupResult,
  GridResource
} from '../helpers/contracts.js';
import {
  browserCsrfToken,
  rememberBrowserCsrfToken
} from '../../identity/events/browser-csrf.js';

//The grid read response contract exported for module callers
export type GridReadResponse =
  | { status: 'ok', data: GridResource, }
  | { status: 'unavailable', reason: string, }
  | { status: 'error', error: { code: string, message: string, }, };

//The grid capability response contract exported for module callers
export type GridCapabilityResponse =
  | { status: 'ok', data: unknown, }
  | {
    status: 'error',
    error: { code: string, message: string, retryable: boolean, issues?: unknown[], },
  };

//The grid read request contract exported for module callers
export type GridReadRequest = {
  viewId?: string,
  expectedViewVersion?: number,
  sort?: { columnId: string, direction: 'asc' | 'desc', },
};

/**
 * Load the grid resource.
 */
export async function loadGridResource(
  folder: string,
  table: string,
  request: GridReadRequest = {}
): Promise<GridReadResponse> {
  try {
    const search = new URLSearchParams({ folder, table });
    if (request.viewId && request.expectedViewVersion) {
      search.set('viewId', request.viewId);
      search.set('expectedViewVersion', String(request.expectedViewVersion));
    }
    if (request.sort) {
      search.set('sortColumnId', request.sort.columnId);
      search.set('sortDirection', request.sort.direction);
    }
    const response = await fetch(`/events/grid?${search}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    return await response.json() as GridReadResponse;
  } catch {
    return {
      status: 'error',
      error: { code: 'network_failure', message: 'The live PostgreSQL rows could not be loaded.' }
    };
  }
}

/**
 * Load the file description.
 */
export async function loadFileDescription(fileId: string) {
  try {
    const response = await fetch(`/events/files?${new URLSearchParams({ fileId })}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    const result = await response.json() as {
      status?: 'ok',
      data?: FileDescription,
      error?: { message?: string, },
    };
    return response.ok && result.status === 'ok' && result.data
      ? { ok: true as const, data: result.data }
      : { ok: false as const, message: result.error?.message || 'The file settings are unavailable.' };
  } catch {
    return { ok: false as const, message: 'The file settings are unavailable.' };
  }
}

/**
 * Load the relation options.
 */
export async function loadRelationOptions(
  fileId: string,
  columnId: string,
  query = '',
  selectedKeys: GridCellValue[][] = []
) {
  try {
    const search = new URLSearchParams({ fileId, columnId, query, limit: '50' });
    if (selectedKeys.length) search.set('keys', JSON.stringify(selectedKeys));
    const response = await fetch(`/events/grid-relation?${search}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    const result = await response.json() as {
      status?: 'ok',
      data?: GridRelationLookupResult,
      reason?: string,
      error?: { message?: string, },
    };
    return response.ok && result.status === 'ok' && result.data
      ? { ok: true as const, data: result.data }
      : { ok: false as const, message: result.reason || result.error?.message || 'Relation choices are unavailable.' };
  } catch {
    return { ok: false as const, message: 'Relation choices are unavailable.' };
  }
}

/**
 * Dispatch the grid capability.
 */
export async function dispatchGridCapability(
  action: CapabilityAction,
  csrfToken: string
): Promise<GridCapabilityResponse> {
  return postGridEvent({ kind: 'capability', action }, csrfToken) as Promise<GridCapabilityResponse>;
}

/**
 * Return the plan grid ddl result.
 */
export async function planGridDdl(
  action: FileDdlAction,
  csrfToken: string
): Promise<{ status: 'ok', data: PlannedFileDdl, } | GridEventFailure> {
  return postGridEvent({ kind: 'ddl.plan', action }, csrfToken) as Promise<
    { status: 'ok', data: PlannedFileDdl, } | GridEventFailure
  >;
}

/**
 * Return the confirm grid ddl result.
 */
export async function confirmGridDdl(
  requestId: string,
  confirmationToken: string,
  csrfToken: string
): Promise<{ status: 'ok', data: ConfirmedFileDdl, } | GridEventFailure> {
  return postGridEvent({
    kind: 'ddl.confirm', requestId, confirmationToken
  }, csrfToken) as Promise<{ status: 'ok', data: ConfirmedFileDdl, } | GridEventFailure>;
}

/**
 * Create the unstructured grid column.
 */
export async function createUnstructuredGridColumn(
  fileId: string,
  count: number,
  csrfToken: string
): Promise<{ status: 'ok', data: Array<{ id: string, fileId: string, }>, } | GridEventFailure> {
  return postGridEvent({
    kind: 'unstructured.column.create',
    fileId,
    count
  }, csrfToken) as Promise<
    { status: 'ok', data: Array<{ id: string, fileId: string, }>, } | GridEventFailure
  >;
}

type GridEventFailure = {
  status: 'error',
  error: { code: string, message: string, retryable?: boolean, issues?: unknown[], },
};

/**
 * Return the post grid event result.
 */
async function postGridEvent(event: Record<string, unknown>, csrfToken: string) {
  try {
    const response = await fetch('/events/grid', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tabular-CSRF': browserCsrfToken(csrfToken)
      },
      body: JSON.stringify({ event })
    });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok && result.status !== 'error') {
      const exposed = result.error && typeof result.error === 'object'
        ? result.error as Record<string, unknown>
        : undefined;
      if (typeof exposed?.code === 'string' && typeof exposed.message === 'string') {
        return {
          status: 'error',
          error: { code: exposed.code, message: exposed.message }
        };
      }
      return {
        status: 'error',
        error: { code: 'request_failed', message: 'The grid action could not be completed.' }
      };
    }
    return result;
  } catch {
    return {
      status: 'error',
      error: {
        code: 'network_failure',
        message: 'The server could not be reached. Your draft was retained.',
        retryable: true
      }
    };
  }
}
