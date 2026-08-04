import type { HttpServer } from '@stackpress/ingest/types';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import {
  renderAuthenticationRequired,
  renderProductPage
} from '../../app/helpers/rendering.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { ExplorerCapabilityAction } from '../events/actions.js';
import type {
  ExplorerFile,
  ExplorerSnapshot
} from '../helpers/contracts.js';
import { authenticatedExplorerContext } from '../helpers/authenticated-context.js';
import { normalizePhysicalName } from '../helpers/model.js';
import type { ExplorerPluginService } from '../helpers/service.js';

export const EXPLORER_ROUTES = [
  '/',
  '/pages/browse.html',
  '/events/explorer'
] as const;

/** Registers Explorer-owned page and action routes. */
export function registerExplorerRoutes(
  server: HttpServer<any, any>,
  runtime: ApplicationRuntimeService,
  identity: IdentityPluginService,
  explorer: ExplorerPluginService
) {
  server.get('/', async ({ req, res }) => {
    const context = await authenticatedExplorerContext(
      req.session(identity.cookieName()),
      identity,
      explorer
    );
    if (!context) return renderAuthenticationRequired(res, runtime);
    await renderProductPage(
      res,
      runtime,
      explorerProps(
        req.url,
        context.snapshot,
        context.identity,
        context.csrfToken
      )
    );
  });

  server.get('/pages/browse.html', async ({ req, res }) => {
    const context = await authenticatedExplorerContext(
      req.session(identity.cookieName()),
      identity,
      explorer
    );
    if (!context) return renderAuthenticationRequired(res, runtime);
    await renderProductPage(
      res,
      runtime,
      explorerProps(
        req.url,
        context.snapshot,
        context.identity,
        context.csrfToken
      )
    );
  });

  server.post('/events/explorer', async ({ req, res }) => {
    requireJson(req.headers.get('content-type'));
    const principal = await identity.requireBrowserMutation({
      cookieToken: req.session(identity.cookieName()),
      csrfToken: req.headers.get('x-tabular-csrf'),
      origin: req.headers.get('origin')
    });
    const snapshot = await explorer.discover(principal);
    const action = resolveExplorerAction(req.data.get('action'), snapshot);
    res.headers.set('Cache-Control', 'no-store, private');
    res.json(await explorer.dispatch(principal, action));
  });
}

/** Rebinds an Explorer action to the current authorized snapshot. */
export function resolveExplorerAction(
  input: unknown,
  snapshot: ExplorerSnapshot
): ExplorerCapabilityAction {
  const record = object(input, 'Explorer action');
  const type = text(record.type, 'action type', 80);
  const commandId = text(record.commandId, 'command ID', 120);
  const submittedFolder = object(record.folder, 'folder');
  const folderId = text(submittedFolder.id, 'folder ID', 200);
  const folder = snapshot.folders.find((candidate) => candidate.id === folderId);
  if (!folder) throw new Error('Explorer folder is unavailable');
  if (type === 'file.create.blank') {
    return {
      type,
      commandId,
      folder,
      displayName: text(record.displayName, 'display name', 200, true)
    };
  }
  const submittedFile = object(record.file, 'file');
  const file = resolveFile(submittedFile, snapshot);
  const sourceFolder = snapshot.folders.find((candidate) => candidate.id === file.folderId);
  if (!sourceFolder) throw new Error('Explorer source folder is unavailable');
  const displayName = text(record.displayName, 'display name', 200, true);
  if (type === 'file.rename.display') {
    return {
      type,
      commandId,
      folder,
      sourceFolder,
      file,
      displayName
    };
  }
  if (type === 'file.settings.apply') {
    return {
      type,
      commandId,
      folder,
      sourceFolder,
      file,
      displayName,
      physicalName: text(record.physicalName, 'physical name', 63, true),
      physicalNameOverridden: record.physicalNameOverridden === true
    };
  }
  throw new Error('Explorer action type is unsupported');
}

function explorerProps(
  url: URL,
  snapshot: ExplorerSnapshot,
  identity: { displayName: string },
  csrfToken: string
) {
  const allowed = new Set(['folder', 'tab']);
  if (
    [...url.searchParams.keys()].some((key) => !allowed.has(key))
    || [...allowed].some((key) => url.searchParams.getAll(key).length > 1)
  ) {
    throw new ApplicationError(
      'invalid_explorer_query',
      400,
      'The Explorer query is invalid'
    );
  }
  const requestedTab = url.searchParams.get('tab');
  if (requestedTab && !['files', 'views'].includes(requestedTab)) {
    throw new ApplicationError(
      'invalid_explorer_query',
      400,
      'The Explorer query is invalid'
    );
  }
  const tab = requestedTab === 'views' ? 'views' as const : 'files' as const;
  const requestedFolder = url.searchParams.get('folder') || undefined;
  const folder = snapshot.folders.find((item) => item.slug === requestedFolder);
  if (requestedFolder && !folder) {
    throw new ApplicationError(
      'explorer_folder_unavailable',
      404,
      'The requested folder is unavailable'
    );
  }
  const denied = Boolean(folder && !folder.permissions.createFile && !folder.permissions.importFile);
  return {
    surface: 'explorer' as const,
    route: {
      ...(requestedFolder ? { folder: requestedFolder } : {}),
      tab,
      scenario: denied ? 'denied' as const : 'ready' as const
    },
    snapshot,
    identity,
    csrfToken
  };
}

function resolveFile(
  input: Record<string, unknown>,
  snapshot: ExplorerSnapshot
): ExplorerFile {
  const id = text(input.id, 'file ID', 200);
  const existing = snapshot.folders
    .flatMap((folder) => folder.files)
    .find((candidate) => candidate.id === id);
  if (existing) return existing;
  if (!id.startsWith('draft_')) throw new Error('Explorer file is unavailable');
  const sourceFolderId = text(input.folderId, 'draft folder ID', 200);
  const sourceFolder = snapshot.folders.find((candidate) => candidate.id === sourceFolderId);
  if (!sourceFolder) throw new Error('Explorer draft folder is unavailable');
  const displayName = text(input.displayName, 'draft display name', 200, true);
  const physicalName = text(input.physicalName, 'draft physical name', 63, true);
  return {
    id,
    folderId: sourceFolder.id,
    slug: normalizePhysicalName(physicalName).replace(/_/g, '-'),
    displayName,
    physicalName: normalizePhysicalName(physicalName),
    kind: 'table',
    readOnly: false,
    columnCount: 0,
    recordCount: 0
  };
}

function object(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum: number, allowWhitespace = false) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  if (!allowWhitespace && !/^[A-Za-z0-9_.:-]+$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function requireJson(contentType: string | string[] | undefined) {
  if (
    typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
  ) {
    throw new Error('Explorer actions require JSON');
  }
}
