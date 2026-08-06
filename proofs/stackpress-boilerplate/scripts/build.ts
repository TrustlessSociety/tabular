//node
import fs from 'node:fs/promises';
import path from 'node:path';
//modules
import type Server from '@stackpress/ingest/Server';
import type { BuildStatus } from 'reactus/types';
import unocss from 'unocss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import Terminal from '@stackpress/lib/Terminal';
import { server as http } from '@stackpress/ingest/http';
//config
import type { Config } from '../config/build.js';
import { config, build } from '../config/build.js';
//src
import type { ViewPlugin } from '../plugins/app/types.js';

async function buildBundles(
  server: Server<any, any, any>,
  cli?: Terminal
) {
  //reactus config
  const config = server.config.get<Config['view']>('view');
  const engine = server.plugin<ViewPlugin>('reactus');

  //add views
  //event -> [ ...{ entry, priority } ]
  for (const views of server.views.values()) {
    for (const view of views) {
      await engine.set(view.entry);
    }
  }

  if (engine.size === 0) {
    return [];
  }

  const responses: BuildStatus[] = [];
  if (config.clientPath) {
    cli && cli.control.system('Building clients...');
    responses.push(await engine.buildAllClients() as BuildStatus);
    cli && cli.control.success('Clients built.');
  }
  if (config.assetPath) {
    cli && cli.control.system('Building assets...');
    responses.push(await engine.buildAllAssets() as BuildStatus);
    cli && cli.control.success('Assets built.');
  }
  if (config.pagePath) {
    cli && cli.control.system('Building pages...');
    responses.push(await engine.buildAllPages() as BuildStatus);
    cli && cli.control.success('Pages built.');
  }

  return responses.map(response => {
    const results = response.results;
    if (typeof results?.contents === 'string') {
      results.contents = results.contents.substring(0, 100) + ' ...';
    }
    return results;
  });
};

async function fsCopyFile(source: string, destination: string) {
  if (await fsExists(source)) {
    const dirname = path.dirname(destination);
    if (!await fsExists(dirname)) {
      await fs.mkdir(dirname, { recursive: true });
    }
    await fs.copyFile(source, destination);
  }
};

async function fsCopyFolder(source: string, destination: string) {
  //find all the files from source
  const files = await fs.readdir(source);
  for (const file of files) {
    //ignore . and ..
    if (file === '.' || file === '..') continue;
    //make an absolute source path
    const absolute = path.join(source, file);
    const stat = await fs.stat(absolute);
    //if file is a directory, recurse
    if (stat.isDirectory()) {
      fsCopyFolder(
        path.join(source, file),
        path.join(destination, file)
      );
      continue;
    }
    await fsCopyFile(absolute, path.join(destination, file));
  }
};

async function fsExists(path: string) {
  return await fs.access(path).then(() => true).catch(() => false);
};

async function main() {
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

  const cwd = server.config.path('cwd', process.cwd());
  const cli = new Terminal([]);
  
  cli.control.system('Copying public...');
  await fsCopyFolder(
    path.join(cwd, 'public'), 
    path.join(build, 'public')
  );

  cli.control.system('Building pages, client and styles...');
  await buildBundles(server, cli);
};

main().then(() => {
  console.log('Build completed successfully.');
  process.exit(0);
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});