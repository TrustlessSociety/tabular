//node
import Terminal from '@stackpress/lib/Terminal';
//modules
import { server as http } from '@stackpress/ingest/http';
//config
import type { Config } from '../config/dev.js';
import { config } from '../config/dev.js';

async function main() {
  const cli = new Terminal([]);
  //make a server
  const server = http<Config>();
  //set config
  server.config.set(config);
  //load the plugins
  await server.bootstrap();
  //initialize the plugins
  await server.resolve('config');
  //add events
  await server.resolve('listen');
  //add routes
  await server.resolve('route');
  //start the server
  server.create().listen(3020, () => {
    cli.control.system('Server is running on port 3020');
    cli.control.system('------------------------------');
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

