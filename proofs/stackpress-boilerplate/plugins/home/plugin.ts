//modules
import type { HttpServer } from '@stackpress/ingest';
//web
import type { Config } from '../app/types.js';

export default function plugin(server: HttpServer<Config>) {
  server.on('route', ({ ctx }) => {
    ctx.get('/', '@/plugins/home/views/index');
  });
}