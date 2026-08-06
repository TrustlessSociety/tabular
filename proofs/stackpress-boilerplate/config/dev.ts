//node
import path from 'node:path';
//modules
import unocss from 'unocss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export type Config = typeof config;

export const cwd = process.cwd();
export const config = {
  cwd,
  env: 'development',
  assets: path.join(cwd, 'public'),
  view: {
    //base path (used in vite)
    basePath: '/',
    //client script route prefix used in the document markup
    //ie. /client/[id][extname]
    //<script type="module" src="/client/[id][extname]"></script>
    //<script type="module" src="/client/abc123.tsx"></script>
    clientRoute: '/client',
    //filepath to a global css file
    cssFiles: [
      'virtual:uno.css'
    ],
    //vite plugins
    plugins: [ unocss(), tsconfigPaths() ]
  }
};
