//modules
import type { BrowserProviderProjection } from '../../app/helpers/projection.js';
import Provider from '../../app/components/Provider.js';
import ExplorerPage from './explorer.js';


type ExplorerViewProps = {
  data: Parameters<typeof ExplorerPage>[0],
  provider: BrowserProviderProjection,
};

export function Head({ styles = [] }: { styles?: string[] }) {
  return (
    <>
      <title>Files — Tabular</title>
      <meta name="description" content="Browse PostgreSQL-backed Tabular files" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {[...styles, '/styles/base.css', '/styles/explorer.css'].map((href) => <link key={href} rel="stylesheet" type="text/css" href={href} />)}
    </>
  );
}

export default function ExplorerView({ data, provider }: ExplorerViewProps) {
  return <Provider {...provider}><ExplorerPage {...data} /></Provider>;
}
