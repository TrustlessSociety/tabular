import http from 'node:http';
import fs from 'node:fs/promises';

const sessionPath = process.env.TABULAR_TASK00009_SESSION_PATH
  || '/tmp/tabular-task00009-sessions.json';
const session = JSON.parse(await fs.readFile(sessionPath, 'utf8')) as {
  ownerCookie: string;
  readerCookie: string;
};
const upstream = new URL('http://127.0.0.1:3068');

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1:3069');
  if (url.pathname === '/__acceptance') {
    const role = url.searchParams.get('role') === 'reader' ? 'reader' : 'owner';
    const target = url.searchParams.get('target') || '/pages/table.html?folder=operations&table=orders';
    response.statusCode = 302;
    response.setHeader(
      'Set-Cookie',
      `tabular_session=${role === 'reader' ? session.readerCookie : session.ownerCookie}; Path=/; HttpOnly; SameSite=Strict`
    );
    response.setHeader('Location', target.startsWith('/') ? target : '/');
    response.end();
    return;
  }

  const proxy = http.request({
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: request.method,
    path: url.pathname.startsWith('/client/') ? url.pathname : request.url,
    headers: { ...request.headers, host: upstream.host, 'accept-encoding': 'identity' }
  }, (upstreamResponse) => {
    const contentType = String(upstreamResponse.headers['content-type'] || '');
    if (!contentType.includes('text/html')) {
      response.writeHead(upstreamResponse.statusCode || 502, {
        ...upstreamResponse.headers,
        'cache-control': 'no-store'
      });
      upstreamResponse.pipe(response);
      return;
    }
    const chunks: Buffer[] = [];
    upstreamResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    upstreamResponse.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8').replace(
        /(src|href)="(\/client\/[^"?]+)(?:\?[^" ]*)?"/g,
        '$1="$2?task00009-rev=7"'
      );
      const headers = { ...upstreamResponse.headers };
      delete headers['content-length'];
      delete headers['content-encoding'];
      response.writeHead(upstreamResponse.statusCode || 502, {
        ...headers,
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body)
      });
      response.end(body);
    });
  });
  proxy.on('error', (error) => {
    response.statusCode = 502;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(`Acceptance proxy failure: ${error.message}`);
  });
  request.pipe(proxy);
});

await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(3069, '127.0.0.1', resolve);
});
console.log('TASK00009_AUTH_PROXY_READY');
await new Promise<void>((resolve) => {
  process.once('SIGTERM', resolve);
  process.once('SIGINT', resolve);
});
await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
