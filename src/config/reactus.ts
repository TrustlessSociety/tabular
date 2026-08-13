//node
import path from 'node:path';

//The reactus config contract exported for module callers
export type ReactusConfig = {
  pagePath: string,
  clientPath: string,
  assetPath: string,
  publicPath: string,
  clientRoute: string,
  assetRoute: string,
  manifestPath: string,
  cssFiles: string[],
};

/**
 * Resolve Reactus source, build, and public asset paths from the project root.
 */
export function loadReactusConfig(projectRoot: string): ReactusConfig {
  //keep filesystem destinations and public routes in one owned mapping so the
  // build and runtime cannot drift independently
  return {
    pagePath: path.join(projectRoot, '.build/pages'),
    clientPath: path.join(projectRoot, 'public/client'),
    assetPath: path.join(projectRoot, 'public/assets'),
    publicPath: path.join(projectRoot, 'public'),
    clientRoute: '/client',
    assetRoute: '/assets',
    manifestPath: path.join(projectRoot, '.build/artifact-manifest.json'),
    cssFiles: ['virtual:uno.css']
  };
}
