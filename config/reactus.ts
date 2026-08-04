import path from 'node:path';

export type ReactusConfig = {
  entry: string;
  pagePath: string;
  clientPath: string;
  assetPath: string;
  clientRoute: string;
  assetRoute: string;
  manifestPath: string;
};

export function loadReactusConfig(projectRoot: string): ReactusConfig {
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
