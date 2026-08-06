//node
import path from 'node:path';
//modules
import unocss from 'unocss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export type Config = typeof config;

export const cwd = process.cwd();
export const build = path.join(cwd, '.build');
export const config = {
  cwd,
  env: 'production',
  assets: path.join(cwd, 'public'),
  view: {
    //path where to save assets (css, images, etc)
    assetPath: path.join(build, 'public', 'assets'),
    //path where to save the client scripts (js)
    clientPath: path.join(build, 'public', 'client'),
    //path where to save the server scripts (js)
    pagePath: path.join(build, 'server'),
    //filepath to a global css file
    cssFiles: [
      'virtual:uno.css'
    ],
    //vite plugins
    plugins: [ unocss(), tsconfigPaths() ],
    //original vite options (overrides other settings related to vite)
    vite: undefined
  }
};
