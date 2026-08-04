import type { HttpServer } from '@stackpress/ingest/types';
import { ApplicationError } from '../../../bootstrap/errors.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { SavedViewsPluginService } from '../helpers/service.js';
import { validateSavedViewAction } from '../helpers/validation.js';

export const SAVED_VIEW_ROUTES = ['/events/saved-views'] as const;

export function registerSavedViewRoutes(
  server: HttpServer<any, any>,
  identity: IdentityPluginService,
  savedViews: SavedViewsPluginService
) {
  server.get('/events/saved-views', async ({ req, res }) => {
    exactQuery(req.url.searchParams, ['fileId', 'viewId']);
    const resumed = await identity.resumeBrowserSession(
      req.session(identity.cookieName())
    );
    if (!resumed) invalidSession();
    res.headers.set('Cache-Control', 'no-store, private');
    res.headers.set('X-Tabular-CSRF', resumed.csrfToken);
    const viewId = req.url.searchParams.get('viewId');
    if (viewId) {
      res.json({
        status: 'ok',
        data: await savedViews.get(resumed.principal, bounded(viewId, 'view ID', 80))
      });
      return;
    }
    const fileId = req.url.searchParams.get('fileId');
    res.json({
      status: 'ok',
      data: await savedViews.list(
        resumed.principal,
        fileId ? [bounded(fileId, 'file ID', 80)] : undefined
      )
    });
  });

  server.post('/events/saved-views', async ({ req, res }) => {
    requireJson(req.headers.get('content-type'));
    const principal = await identity.requireBrowserMutation({
      cookieToken: req.session(identity.cookieName()),
      csrfToken: req.headers.get('x-tabular-csrf'),
      origin: req.headers.get('origin')
    });
    let action;
    try {
      action = validateSavedViewAction(req.data.get('action'));
    } catch (error) {
      throw new ApplicationError(
        'invalid_saved_view_action',
        400,
        error instanceof Error ? error.message : 'The saved-view action is invalid'
      );
    }
    res.headers.set('Cache-Control', 'no-store, private');
    if (action.type === 'saved-view.create') {
      res.json({ status: 'ok', data: await savedViews.create(principal, action, action.commandId) });
      return;
    }
    if (action.type === 'saved-view.update') {
      res.json({ status: 'ok', data: await savedViews.update(principal, action, action.commandId) });
      return;
    }
    if (action.type === 'saved-view.duplicate') {
      res.json({
        status: 'ok',
        data: await savedViews.duplicate(principal, action, action.commandId)
      });
      return;
    }
    if (action.type === 'saved-view.delete') {
      res.json({ status: 'ok', data: await savedViews.delete(principal, action, action.commandId) });
      return;
    }
    res.json({ status: 'ok', data: await savedViews.moveRow(principal, action, action.commandId) });
  });
}

function exactQuery(parameters: URLSearchParams, allowed: string[]) {
  if ([...parameters.keys()].some((key) => !allowed.includes(key))) {
    throw new ApplicationError('invalid_query', 400, 'The saved-view query is invalid');
  }
}

function bounded(value: string, label: string, maximum: number) {
  if (!value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ApplicationError('invalid_query', 400, `The ${label} is invalid`);
  }
  return value;
}

function requireJson(contentType: string | string[] | undefined) {
  if (typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new ApplicationError('invalid_content_type', 415, 'A JSON request is required');
  }
}

function invalidSession(): never {
  throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
}
