//client
import type {
  ConfirmedFileDdl,
  FileDdlAction,
  FileDdlStatus,
  PlannedFileDdl
} from '../../files/helpers/contracts.js';
import type { ExplorerFile, ExplorerFolder } from '../helpers/contracts.js';
import { duplicateDisplayName, normalizePhysicalName } from '../helpers/model.js';
import {
  browserCsrfToken,
  rememberBrowserCsrfToken
} from '../../identity/events/browser-csrf.js';

//The explorer capability action contract exported for module callers
export type ExplorerCapabilityAction =
  | {
    type: 'file.create.blank',
    commandId: string,
    folder: ExplorerFolder,
    displayName: string,
  }
  | {
    type: 'file.rename.display',
    commandId: string,
    folder: ExplorerFolder,
    sourceFolder: ExplorerFolder,
    file: ExplorerFile,
    displayName: string,
  }
  | {
    type: 'file.settings.apply',
    commandId: string,
    folder: ExplorerFolder,
    sourceFolder: ExplorerFolder,
    file: ExplorerFile,
    displayName: string,
    physicalName: string,
    physicalNameOverridden: boolean,
  };

//The explorer action result contract exported for module callers
export type ExplorerActionResult =
  | {
    ok: true,
    file: ExplorerFile,
    ddl: FileDdlAction,
    physicalChange: 'none' | 'confirmation-required',
    plan?: PlannedFileDdl,
  }
  | { ok: false, code: 'duplicate_name' | 'permission_denied' | 'invalid_name' | 'backend_failure', message: string, };

/**
 * Dispatch the explorer action.
 */
export async function dispatchExplorerAction(
  action: ExplorerCapabilityAction,
  options: { fail?: boolean, csrfToken?: string, } = {}
): Promise<ExplorerActionResult> {
  await Promise.resolve();
  if (options.fail) {
    return { ok: false, code: 'backend_failure', message: 'The change could not be saved. Try again.' };
  }
  if (options.csrfToken) return postExplorerAction(action, options.csrfToken);
  const permission = action.type === 'file.create.blank'
    ? action.folder.permissions.createFile
    : action.type === 'file.rename.display'
      ? action.sourceFolder.permissions.renameFile && action.folder.permissions.renameFile
      : action.sourceFolder.permissions.configureFile && action.folder.permissions.configureFile;
  if (!permission) {
    return { ok: false, code: 'permission_denied', message: 'You do not have permission to change files in this folder.' };
  }

  if (action.type === 'file.create.blank') {
    const displayName = action.displayName.trim();
    if (!displayName) {
      return { ok: false, code: 'invalid_name', message: 'Enter a file name.' };
    }
    if (duplicateDisplayName(action.folder.files, displayName)) {
      return { ok: false, code: 'duplicate_name', message: `A file named “${displayName}” already exists in ${action.folder.displayName}.` };
    }
    const physicalName = uniquePhysicalName(action.folder.files, normalizePhysicalName(displayName));
    const draft: ExplorerFile = {
      id: `draft_${action.commandId}`,
      folderId: action.folder.id,
      slug: physicalName.replace(/_/g, '-'),
      displayName,
      physicalName,
      kind: 'table',
      readOnly: false,
      columnCount: 0,
      recordCount: 0
    };
    return {
      ok: true,
      file: draft,
      ddl: {
        type: 'file.create',
        commandId: action.commandId,
        schemaId: action.folder.id,
        displayName: draft.displayName
      },
      physicalChange: 'confirmation-required'
    };
  }

  const displayName = action.displayName.trim();
  if (!displayName) {
    return { ok: false, code: 'invalid_name', message: 'Enter a file name.' };
  }
  if (duplicateDisplayName(action.folder.files, displayName, action.file.id)) {
    return { ok: false, code: 'duplicate_name', message: `A file named “${displayName}” already exists in ${action.folder.displayName}.` };
  }

  const nextPhysical = action.type === 'file.settings.apply'
    ? action.physicalName.trim()
    : normalizePhysicalName(displayName);
  const file = {
    ...action.file,
    folderId: action.folder.id,
    displayName,
    physicalName: nextPhysical || action.file.physicalName
  };
  const physicalChanged = file.physicalName !== action.file.physicalName;
  return {
    ok: true,
    file,
    ddl: {
      type: 'file.rename',
      commandId: action.commandId,
      fileId: action.file.id,
      displayName,
      ...(physicalChanged ? { physicalName: file.physicalName } : {})
    },
    physicalChange: physicalChanged ? 'confirmation-required' : 'none'
  };
}

/**
 * Return the post explorer action result.
 */
async function postExplorerAction(
  action: ExplorerCapabilityAction,
  csrfToken: string
): Promise<ExplorerActionResult> {
  try {
    const response = await fetch('/events/explorer', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Tabular-CSRF': browserCsrfToken(csrfToken)
      },
      body: JSON.stringify({ action })
    });
    const result = await response.json() as ExplorerActionResult | {
      error?: { message?: string, },
    };
    if (!response.ok || !('ok' in result)) {
      return {
        ok: false,
        code: response.status === 401 || response.status === 403
          ? 'permission_denied'
          : 'backend_failure',
        message: 'error' in result && result.error?.message
          ? result.error.message
          : 'The change could not be saved. Try again.'
      };
    }
    return result;
  } catch {
    return {
      ok: false,
      code: 'backend_failure',
      message: 'The change could not be saved. Try again.'
    };
  }
}

/**
 * Derive the physical name.
 */
export function derivePhysicalName(displayName: string, overridden: boolean, current: string) {
  return overridden ? current : normalizePhysicalName(displayName);
}

/**
 * Apply the explorer ddl plan.
 */
export async function applyExplorerDdlPlan(
  plan: PlannedFileDdl,
  csrfToken: string
): Promise<ExplorerDdlWaitResult> {
  const confirmation = await confirmExplorerDdl(
    plan.requestId,
    plan.confirmationToken,
    csrfToken
  );
  if (confirmation.status === 'error') return confirmation;
  return waitForExplorerDdl(plan.requestId);
}

//The explorer ddl response contract exported for module callers
export type ExplorerDdlResponse<Result> =
  | { status: 'ok', data: Result, }
  | { status: 'error', error: { code: string, message: string, retryable?: boolean, }, };

/**
 * Return the confirm explorer ddl result.
 */
export async function confirmExplorerDdl(
  requestId: string,
  confirmationToken: string,
  csrfToken: string
): Promise<ExplorerDdlResponse<ConfirmedFileDdl>> {
  return postDdlEvent({ kind: 'ddl.confirm', requestId, confirmationToken }, csrfToken) as Promise<
    ExplorerDdlResponse<ConfirmedFileDdl>
  >;
}

/**
 * Load the explorer ddl status.
 */
export async function loadExplorerDdlStatus(
  requestId: string
): Promise<ExplorerDdlResponse<FileDdlStatus>> {
  try {
    const response = await fetch(`/events/files?${new URLSearchParams({ ddlRequestId: requestId })}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    rememberBrowserCsrfToken(response.headers.get('x-tabular-csrf'));
    const result = await response.json() as ExplorerDdlResponse<FileDdlStatus> | {
      error?: { code?: string, message?: string, },
    };
    if (response.ok && 'status' in result && result.status === 'ok') return result;
    const exposed = 'error' in result ? result.error : undefined;
    return {
      status: 'error',
      error: {
        code: exposed?.code || 'request_failed',
        message: exposed?.message || 'The schema-change status is unavailable.'
      }
    };
  } catch {
    return {
      status: 'error',
      error: {
        code: 'network_failure',
        message: 'The schema-change status could not be loaded.',
        retryable: true
      }
    };
  }
}

//The explorer ddl wait result contract exported for module callers
export type ExplorerDdlWaitResult =
  | { status: 'applied', data: FileDdlStatus & { state: 'applied', result: NonNullable<FileDdlStatus['result']>, }, }
  | { status: 'pending', data: FileDdlStatus, }
  | { status: 'error', error: { code: string, message: string, retryable?: boolean, }, };

/**
 * Wait for the explorer ddl.
 */
export async function waitForExplorerDdl(
  requestId: string,
  options: {
    attempts?: number,
    intervalMs?: number,
    load?: typeof loadExplorerDdlStatus,
    pause?: (milliseconds: number) => Promise<void>,
  } = {}
): Promise<ExplorerDdlWaitResult> {
  const attempts = options.attempts ?? 120;
  const intervalMs = options.intervalMs ?? 250;
  const load = options.load || loadExplorerDdlStatus;
  const pause = options.pause || ((milliseconds: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  }));
  let latest: FileDdlStatus | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await load(requestId);
    if (result.status === 'error') return result;
    latest = result.data;
    if (latest.state === 'applied' && latest.result) {
      return {
        status: 'applied',
        data: latest as FileDdlStatus & {
          state: 'applied',
          result: NonNullable<FileDdlStatus['result']>,
        }
      };
    }
    if (latest.operation?.error && ['failed', 'cancelled', 'dead-letter'].includes(latest.operation.state)) {
      return { status: 'error', error: latest.operation.error };
    }
    if (attempt + 1 < attempts) await pause(intervalMs);
  }
  if (!latest) {
    return {
      status: 'error',
      error: { code: 'status_unavailable', message: 'The schema-change status is unavailable.' }
    };
  }
  return { status: 'pending', data: latest };
}

/**
 * Return the post ddl event result.
 */
async function postDdlEvent(event: Record<string, unknown>, csrfToken: string) {
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
    const result = await response.json() as ExplorerDdlResponse<unknown> | {
      error?: { code?: string, message?: string, },
    };
    if (response.ok && 'status' in result && result.status === 'ok') return result;
    const exposed = 'error' in result ? result.error : undefined;
    return {
      status: 'error',
      error: {
        code: exposed?.code || 'request_failed',
        message: exposed?.message || 'The schema change could not be confirmed.'
      }
    };
  } catch {
    return {
      status: 'error',
      error: {
        code: 'network_failure',
        message: 'The server could not be reached. Confirmation status is unknown.',
        retryable: true
      }
    };
  }
}

/**
 * Report the unique physical name condition.
 */
function uniquePhysicalName(files: ExplorerFile[], base: string) {
  const names = new Set(files.map((item) => item.physicalName));
  if (!names.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    if (!names.has(`${base}_${suffix}`)) return `${base}_${suffix}`;
  }
  return `${base}_${Date.now()}`;
}
