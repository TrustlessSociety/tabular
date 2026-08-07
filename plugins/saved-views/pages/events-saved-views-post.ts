//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { SAVED_VIEWS_SERVICE, type SavedViewsPluginService } from '../helpers/service.js';
import { validateSavedViewAction } from '../helpers/validation.js';

const savedViewsPost: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const savedViews = ctx.plugin<SavedViewsPluginService>(SAVED_VIEWS_SERVICE);
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
    res.json({ status: 'ok', data: await savedViews.duplicate(principal, action, action.commandId) });
    return;
  }
  if (action.type === 'saved-view.delete') {
    res.json({ status: 'ok', data: await savedViews.delete(principal, action, action.commandId) });
    return;
  }
  res.json({ status: 'ok', data: await savedViews.moveRow(principal, action, action.commandId) });
};

function requireJson(contentType: string | string[] | undefined) {
  if (typeof contentType !== 'string'
    || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new ApplicationError('invalid_content_type', 415, 'A JSON request is required');
  }
}

export default savedViewsPost;
