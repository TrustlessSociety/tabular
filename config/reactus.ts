//node
import path from 'node:path';

//The reactus config contract exported for module callers
export type ReactusConfig = {
  entry: string,
  pagePath: string,
  clientPath: string,
  assetPath: string,
  clientRoute: string,
  assetRoute: string,
  manifestPath: string,
};

/**
 * Resolve Reactus source, build, and public asset paths from the project root.
 */
export function loadReactusConfig(projectRoot: string): ReactusConfig {
  //keep filesystem destinations and public routes in one owned mapping so the
  // build and runtime cannot drift independently
  return {
    entry: '@/plugins/ui/views/workbench',
    pagePath: path.join(projectRoot, '.build/pages'),
    clientPath: path.join(projectRoot, 'public/client'),
    assetPath: path.join(projectRoot, 'public/assets'),
    clientRoute: '/client',
    assetRoute: '/assets',
    manifestPath: path.join(projectRoot, '.build/artifact-manifest.json')
  };
}
