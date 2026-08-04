import {
  browserCsrfToken,
  rememberBrowserCsrfToken
} from '../../identity/events/browser-csrf.js';
import type {
  SavedView,
  SavedViewAction,
  SavedViewCollection
} from '../helpers/contracts.js';

export type SavedViewReadResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; error: { code: string; message: string } };

export async function loadSavedViews(fileId: string): Promise<SavedViewReadResult<SavedViewCollection>> {
  return readSavedViews<SavedViewCollection>(new URLSearchParams({ fileId }));
}

export async function loadSavedView(viewId: string): Promise<SavedViewReadResult<SavedView>> {
  return readSavedViews<SavedView>(new URLSearchParams({ viewId }));
}

export async function dispatchSavedViewAction(
  action: SavedViewAction,
  csrfToken: string
): Promise<SavedViewReadResult<unknown>> {
  try {
    const response = await fetch('/events/saved-views', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Tabular-CSRF': browserCsrfToken(csrfToken)
      },
      body: JSON.stringify({ action })
    });
    const result = await response.json() as SavedViewReadResult<unknown> | {
      error?: { code?: string; message?: string }
    };
    if (!response.ok) return {
      status: 'error',
      error: {
        code: 'error' in result && result.error?.code || 'request_failed',
        message: 'error' in result && result.error?.message
          || 'The saved-view change could not be completed.'
      }
    };
    return result as SavedViewReadResult<unknown>;
  } catch {
    return {
      status: 'error',
      error: {
        code: 'network_failure',
        message: 'The server could not be reached. The current tab state was retained.'
      }
    };
  }
}
async function readSavedViews<T>(search: URLSearchParams): Promise<SavedViewReadResult<T>> {
  try {
    const response = await fetch(`/events/saved-views?${search}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    const result = await response.json() as SavedViewReadResult<T> | {
      error?: { code?: string; message?: string }
    };
    if (!response.ok) return {
      status: 'error',
      error: {
        code: 'error' in result && result.error?.code || 'request_failed',
        message: 'error' in result && result.error?.message || 'Saved views are unavailable.'
      }
    };
    return result as SavedViewReadResult<T>;
  } catch {
    return {
      status: 'error',
      error: { code: 'network_failure', message: 'Saved views are unavailable.' }
    };
  }
}
