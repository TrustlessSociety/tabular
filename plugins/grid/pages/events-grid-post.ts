//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { CAPABILITY_SERVICE, type CapabilityPluginService } from '../../capability/helpers/service.js';
import { FILES_SERVICE, type FilesPluginService } from '../../files/helpers/service.js';
import { WebCapabilityAdapter } from '../../capability/events/web-adapter.js';
import { requireJson, exactKeys, object, text } from '../helpers/events.js';

const eventsGridPost: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const capability = ctx.plugin<CapabilityPluginService>(CAPABILITY_SERVICE);
  const files = ctx.plugin<FilesPluginService>(FILES_SERVICE);
  requireJson(req.headers.get('content-type'));
  const principal = await identity.requireBrowserMutation({
    cookieToken: req.session(identity.cookieName()),
    csrfToken: req.headers.get('x-tabular-csrf'),
    origin: req.headers.get('origin')
  });
  const envelope = object(req.data.get('event'), 'Grid event');
  const kind = text(envelope.kind, 'grid event kind', 40);
  res.headers.set('Cache-Control', 'no-store, private');
  if (kind === 'capability') {
    exactKeys(envelope, ['kind', 'action']);
    res.json(await new WebCapabilityAdapter(identity, capability).invoke(principal, { action: envelope.action }));
    return;
  }
  if (kind === 'ddl.plan') {
    exactKeys(envelope, ['kind', 'action']);
    res.json({ status: 'ok', data: await files.plan(principal, envelope.action as never) });
    return;
  }
  if (kind === 'ddl.confirm') {
    exactKeys(envelope, ['kind', 'requestId', 'confirmationToken']);
    res.json({ status: 'ok', data: await files.confirm(principal, text(envelope.requestId, 'DDL request ID', 160), text(envelope.confirmationToken, 'DDL confirmation token', 200)) });
    return;
  }
  if (kind === 'unstructured.column.create') {
    exactKeys(envelope, ['kind', 'fileId', 'count']);
    const count = Number(envelope.count);
    if (!Number.isSafeInteger(count) || count < 1 || count > 12) throw new Error('Unstructured column count is invalid');
    const fileId = text(envelope.fileId, 'file ID', 80);
    const created = [];
    for (let index = 0; index < count; index += 1) {
      created.push(await files.createUnstructuredColumn(principal, { fileId, displayName: '', field: 'text', format: 'plain-text' }));
    }
    res.json({ status: 'ok', data: created });
    return;
  }
  throw new Error('Grid event kind is unsupported');
};

export default eventsGridPost;
