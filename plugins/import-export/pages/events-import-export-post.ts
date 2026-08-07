//client
import type { ApplicationHttpAction } from '../../../bootstrap/application.js';
import { IDENTITY_SERVICE, type IdentityPluginService } from '../../identity/helpers/service.js';
import { IMPORT_EXPORT_SERVICE, type ImportExportPluginService } from '../helpers/service.js';
import { actionInput, requireJson } from '../helpers/routes.js';

const importExportPost: ApplicationHttpAction = async ({ req, res, ctx }) => {
  const identity = ctx.plugin<IdentityPluginService>(IDENTITY_SERVICE);
  const importExport = ctx.plugin<ImportExportPluginService>(IMPORT_EXPORT_SERVICE);
  requireJson(req.headers.get('content-type'));
  const principal = await identity.requireBrowserMutation({
    cookieToken: req.session(identity.cookieName()),
    csrfToken: req.headers.get('x-tabular-csrf'),
    origin: req.headers.get('origin')
  });
  const action = actionInput(req.data.get('action'));
  res.headers.set('Cache-Control', 'no-store, private');
  if (action.type === 'google.oauth.start') {
    res.json({ status: 'ok', data: await importExport.startGoogleOAuth(principal, action.returnPath) });
    return;
  }
  if (action.type === 'google.spreadsheets.list') {
    res.json({ status: 'ok', data: await importExport.listGoogleSpreadsheets(principal, action.pageToken) });
    return;
  }
  if (action.type === 'google.worksheets.list') {
    res.json({ status: 'ok', data: await importExport.listGoogleWorksheets(principal, action.spreadsheetId) });
    return;
  }
  if (action.type === 'google.import.stage') {
    res.json({ status: 'ok', data: await importExport.stageGoogleImport(principal, action) });
    return;
  }
  if (action.type === 'google.connection.revoke') {
    res.json({ status: 'ok', data: await importExport.revokeGoogleConnection(principal) });
    return;
  }
  if (action.type === 'import.mapping') {
    res.json({ status: 'ok', data: await importExport.updateMapping(principal, action) });
    return;
  }
  if (action.type === 'import.sheet') {
    res.json({ status: 'ok', data: await importExport.finalizeSource(principal, action.importId, { sheetName: action.sheetName }) });
    return;
  }
  if (action.type === 'import.prepare-confirmation') {
    res.json({ status: 'ok', data: await importExport.prepareConfirmation(principal, action.importId) });
    return;
  }
  if (action.type === 'import.confirm') {
    res.json({ status: 'ok', data: await importExport.confirm(principal, action.importId, action.confirmationToken) });
    return;
  }
  if (action.type === 'import.cancel') {
    res.json({ status: 'ok', data: await importExport.cancel(principal, action.importId) });
    return;
  }
  if (action.type === 'import.retry') {
    res.json({ status: 'ok', data: await importExport.retry(principal, action.importId) });
    return;
  }
  const csv = await importExport.exportCsv(principal, action);
  res.headers.set('Content-Disposition', csv.contentDisposition);
  res.headers.set('X-Tabular-Export-Rows', String(csv.rowCount));
  res.headers.set('X-Tabular-Export-Columns', String(csv.columnCount));
  res.headers.set('X-Tabular-Sanitized-Cells', String(csv.sanitizedCells));
  res.set(csv.contentType, csv.bytes, 200);
};

export default importExportPost;
