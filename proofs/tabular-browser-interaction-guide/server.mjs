import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase, closeDatabase } from '../lib/database.mjs';
import { BrowserGuideService, setupBrowserGuide } from './service.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const tabulatorRoot = path.resolve(root, '../node_modules/tabulator-tables/dist');
const port = Number(process.env.TABULAR_P101_PORT ?? 4312);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const db = await createDatabase();
await setupBrowserGuide(db);
const service = new BrowserGuideService(db);

function json(response, status, body) {
  response.writeHead(status, { 'content-type': mime['.json'] });
  response.end(`${JSON.stringify(body)}\n`);
}

async function input(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

async function api(request, response, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
      json(response, 200, {
        hierarchy: await service.hierarchy(),
        files: await service.files(url.searchParams.get('folder'))
      });
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/state') {
      json(response, 200, await service.state(url.searchParams.get('file') || 'customer-orders'));
      return true;
    }
    if (request.method === 'POST' && url.pathname === '/api/action') {
      const body = await input(request);
      let result;
      switch (body.type) {
        case 'rename-file':
          result = await service.renameFile(body.fileId, body.displayName);
          break;
        case 'table-settings':
          result = await service.updateTableSettings(body.fileId, body.input);
          break;
        case 'column-settings':
          result = await service.updateColumn(body.fileId, body.columnId, body.input);
          break;
        case 'edit-cell':
          result = await service.editCell(
            body.fileId,
            body.rowKey,
            body.columnId,
            body.value,
            body.expectedVersion
          );
          break;
        case 'presentation':
          result = await service.setPresentation(body.fileId, body.patch);
          break;
        case 'add-rows':
          result = await service.addRows(body.fileId, body.amount);
          break;
        case 'prepare-range-action':
          result = await service.prepareRangeAction(
            body.fileId,
            body.operation,
            body.rowIds,
            body.columnIds
          );
          break;
        case 'reorder-column':
          result = await service.reorderColumn(body.fileId, body.columnId, body.targetPosition);
          break;
        case 'create-file':
          result = await service.createBlankFile(body.folder);
          break;
        case 'import-values':
          result = await service.importValues(body.input);
          break;
        case 'undo':
          result = await service.undo(body.fileId);
          break;
        case 'redo':
          result = await service.redo(body.fileId);
          break;
        default:
          json(response, 400, { status: 'error', message: 'unknown-action' });
          return true;
      }
      json(response, 200, result);
      return true;
    }
    return false;
  } catch (error) {
    json(response, 400, { status: 'error', message: error.message });
    return true;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname.startsWith('/api/') && (await api(request, response, url))) return;
  const vendorFiles = {
    '/vendor/tabulator.mjs': path.join(tabulatorRoot, 'js/tabulator_esm.min.mjs'),
    '/vendor/tabulator.css': path.join(tabulatorRoot, 'css/tabulator.min.css')
  };
  if (vendorFiles[url.pathname]) {
    const file = vendorFiles[url.pathname];
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(body);
    return;
  }
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Spec 00002 P-001 ready at http://127.0.0.1:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await closeDatabase(db);
      process.exit(0);
    });
  });
}
