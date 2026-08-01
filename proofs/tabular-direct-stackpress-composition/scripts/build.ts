import path from 'node:path';
import { build } from 'reactus';

const cwd = process.cwd();
const engine = build({
  cwd,
  assetPath: path.join(cwd, 'public/assets'),
  clientPath: path.join(cwd, 'public/client'),
  pagePath: path.join(cwd, '.build/pages')
});

await engine.set('@/pages/proof');
const responses = [
  ...await engine.buildAllClients(),
  ...await engine.buildAllAssets(),
  ...await engine.buildAllPages()
];

if (responses.some((response) => response.code && response.code >= 400)) {
  throw new Error('Reactus production build returned a failed response');
}

console.log(`Reactus built ${responses.length} proof artifacts.`);
