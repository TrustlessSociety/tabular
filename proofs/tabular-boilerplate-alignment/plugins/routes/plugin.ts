import type { HttpServer } from '@stackpress/ingest';

export default function routes(server: HttpServer) {
  server.on('route', ({ ctx }) => {
    ctx.import.get('/', () => import('../../pages/home.js'), 1);
    ctx.view.get('/', '@/plugins/static/view');
    ctx.import.get('/customer', () => import('../../pages/customer.js'), 1);
    ctx.view.get('/customer', '@/plugins/customer/view');
  });
}
