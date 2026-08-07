import path from 'node:path';
import unocss from 'unocss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const cwd = process.cwd();
const build = path.join(cwd, '.build');

export const development = {
  cwd,
  env: 'development',
  assets: path.join(cwd, 'public'),
  view: { basePath: '/', clientRoute: '/client', cssFiles: ['virtual:uno.css'], plugins: [unocss(), tsconfigPaths()] }
};

export const production = {
  cwd,
  env: 'production',
  assets: path.join(build, 'public'),
  view: {
    assetPath: path.join(build, 'public/assets'),
    clientPath: path.join(build, 'public/client'),
    pagePath: path.join(build, 'server'),
    cssFiles: ['virtual:uno.css'],
    plugins: [unocss(), tsconfigPaths()]
  }
};

export { build };
