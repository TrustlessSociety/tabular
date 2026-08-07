//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { EXPLORER_SERVICE, type ExplorerPluginService } from '../../explorer/helpers/service.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { GRID_SERVICE, type GridPluginService } from '../helpers/service.js';
import { authenticatedExplorerContext } from '../../explorer/helpers/authenticated-context.js';

const eventsGridRelation: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const explorer = ctx.plugin<ExplorerPluginService>(EXPLORER_SERVICE);
  const grid = ctx.plugin<GridPluginService>(GRID_SERVICE);
  const context = await authenticatedExplorerContext(
    req.session(identity.cookieName()), identity, explorer
  );
  if (!context) {
    res.json({ status: 'error', error: { code: 'invalid_session', message: 'The browser session is invalid' } }, 401);
    return;
  }
  const allowed = new Set(['fileId', 'columnId', 'query', 'limit', 'keys']);
  if ([...req.url.searchParams.keys()].some((key) => !allowed.has(key))) {
    throw new Error('Relation lookup query is invalid');
  }
  const fileId = text(req.url.searchParams.get('fileId'), 'file ID', 80);
  const columnId = text(req.url.searchParams.get('columnId'), 'column ID', 80);
  const query = req.url.searchParams.get('query') || '';
  if (query.length > 200 || /[\u0000-\u001f\u007f]/.test(query)) throw new Error('Relation lookup text is invalid');
  const limit = Number(req.url.searchParams.get('limit') || '25');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Relation lookup limit is invalid');
  const selectedKeys = relationSelectedKeys(req.url.searchParams.get('keys'));
  res.headers.set('Cache-Control', 'no-store, private');
  res.headers.set('X-Tabular-CSRF', context.csrfToken);
  const result = await grid.lookupRelation(context.principal, {
    fileId, columnId, query, limit, ...(selectedKeys.length ? { selectedKeys } : {})
  });
  res.json(result
    ? { status: 'ok', data: result }
    : { status: 'unavailable', reason: 'The authorized relation lookup is unavailable.' }, result ? 200 : 404);
};

function relationSelectedKeys(value: string | null): Array<Array<string | number | boolean | null>> {
  if (!value) return [];
  if (value.length > 12_000) throw new Error('Relation lookup keys are invalid');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('Relation lookup keys are invalid'); }
  if (!Array.isArray(parsed) || parsed.length > 50) throw new Error('Relation lookup keys are invalid');
  return parsed.map((tuple) => {
    if (!Array.isArray(tuple) || !tuple.length || tuple.length > 8) throw new Error('Relation lookup keys are invalid');
    return tuple.map((item) => {
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (typeof item === 'string' && item.length <= 200 && !/[\u0000-\u001f\u007f]/.test(item)) return item;
      throw new Error('Relation lookup keys are invalid');
    });
  });
}

function text(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum
    || !/^[A-Za-z0-9_.:-]+$/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export default eventsGridRelation;
