//modules
import type { BrowserProviderProjection } from '../../app/helpers/projection.js';
import Provider from '../../app/components/Provider.js';
import { ImportPage } from './import-page.js';



type ImportViewProps = {
  data: Parameters<typeof ImportPage>[0],
  provider: BrowserProviderProjection,
};

export function Head({ styles = [] }: { styles?: string[] }) {
  return (
    <>
      <title>Import values — Tabular</title>
      <meta name="description" content="Start a values-only import" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {[...styles, '/styles/base.css', '/styles/explorer.css', '/styles/import.css'].map((href) => <link key={href} rel="stylesheet" type="text/css" href={href} />)}
    </>
  );
}

export default function ImportView({ data, provider }: ImportViewProps) {
  return <Provider {...provider}><ImportPage {...data} /></Provider>;
}
