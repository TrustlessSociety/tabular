import {
  browserCsrfToken,
  rememberBrowserCsrfToken
} from '../../identity/events/browser-csrf.js';

export type OperationBrowserAction =
  | { type: 'operation.retry'; jobId: string }
  | { type: 'operation.cancel'; jobId: string }
  | { type: 'operation.acknowledge'; jobId: string }
  | { type: 'operation.mark-read'; jobId: string }
  | { type: 'operations.retention.apply'; retentionDays: number; limit: number };

export type OperationsBrowserResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; error: { code: string; message: string } };

export async function loadActivitySnapshot<T>(): Promise<OperationsBrowserResult<T>> {
  return readOperations<T>(new URLSearchParams());
}

export async function loadActivityOperation<T>(jobId: string): Promise<OperationsBrowserResult<T>> {
  return readOperations<T>(new URLSearchParams({ jobId }));
}

/**
 * Mutations contain an opaque job ID only. Caller, connection, role, target,
 * and permission claims are resolved again by the server-side service.
 */
export async function dispatchOperationAction<T>(
  action: OperationBrowserAction,
  csrfToken: string
): Promise<OperationsBrowserResult<T>> {
  try {
    const response = await fetch('/events/operations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tabular-CSRF': browserCsrfToken(csrfToken)
      },
      body: JSON.stringify({ action })
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    return await operationResult<T>(response, 'The activity change could not be completed.');
  } catch {
    return networkFailure('The server could not be reached. The current activity snapshot was retained.');
  }
}

async function readOperations<T>(search: URLSearchParams): Promise<OperationsBrowserResult<T>> {
  try {
    const query = search.size ? `?${search}` : '';
    const response = await fetch(`/events/operations${query}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    return await operationResult<T>(response, 'System activity is unavailable.');
  } catch {
    return networkFailure('System activity is unavailable.');
  }
}

async function operationResult<T>(response: Response, fallback: string): Promise<OperationsBrowserResult<T>> {
  let result: OperationsBrowserResult<T> | { error?: { code?: string; message?: string } };
  try {
    result = await response.json() as typeof result;
  } catch {
    return { status: 'error', error: { code: 'invalid_response', message: fallback } };
  }
  if (!response.ok || !('status' in result) || result.status !== 'ok') {
    return {
      status: 'error',
      error: {
        code: 'error' in result && result.error?.code || 'request_failed',
        message: 'error' in result && result.error?.message || fallback
      }
    };
  }
  return result as OperationsBrowserResult<T>;
}

function networkFailure(message: string): OperationsBrowserResult<never> {
  return { status: 'error', error: { code: 'network_failure', message } };
}
