import fs from 'node:fs/promises';
import path from 'node:path';
import { server as http } from '@stackpress/ingest/http';
import { build, production } from '../config.js';
import { createManifest } from '../src/artifacts.js';

const server = http();
server.config.set(production);
await server.bootstrap();
await server.resolve('config');
await server.resolve('route');

const engine = server.plugin<any>('reactus');
for (const views of server.views.values()) for (const view of views) await engine.set(view.entry);
if (engine.size !== 2) throw new Error(`Expected two discovered views, got ${engine.size}`);
await fs.mkdir(path.join(build, 'public'), { recursive: true });
const results = [...await engine.buildAllClients(), ...await engine.buildAllAssets(), ...await engine.buildAllPages()];
if (results.some((result: any) => result.code >= 400)) throw new Error('Reactus build failed');
const manifest = await createManifest(path.join(build, 'public'));
await fs.writeFile(path.join(build, 'artifact-manifest.json'), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(build, 'proof.json'), JSON.stringify({ views: engine.size, sideEffects: false, artifactCount: Object.keys(manifest).length }, null, 2));
console.log('P-002 built two discovered views without resolving listen.');
