import { server as http } from '@stackpress/ingest/http';
import { development } from '../config.js';

const server = http();
server.config.set(development);
await server.bootstrap();
await server.resolve('config');
await server.resolve('route');
server.create().listen(3032, () => console.log('P-002 development proof at http://127.0.0.1:3032'));
