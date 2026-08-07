//modules
import type { BrowserProviderProjection } from '../../app/helpers/projection.js';
import Provider from '../../app/components/Provider.js';
import ActivityPage from './activity-page.js';
import { Icon } from '../../app/components/icon.js';



type AuthRequiredData = {
  application: 'Tabular',
  status: 'starting' | 'ready',
  version: string,
  surface: 'auth-required',
};
type ActivityViewProps = {
  data: Parameters<typeof ActivityPage>[0] | AuthRequiredData,
  provider: BrowserProviderProjection,
};

export function Head({ styles = [] }: { styles?: string[] }) {
  return (
    <>
      <title>System activity — Tabular</title>
      <meta name="description" content="Monitor and recover authorized Tabular background operations" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {[...styles, '/styles/base.css', '/styles/explorer.css', '/styles/activity.css'].map((href) => <link key={href} rel="stylesheet" type="text/css" href={href} />)}
    </>
  );
}

function AuthenticationRequired({ data }: { data: AuthRequiredData }) {
  return (
    <div className="explorer-shell">
      <header className="explorer-topbar"><span className="explorer-brand"><strong>Tabular</strong></span></header>
      <main className="explorer-main">
        <section className="explorer-state" aria-labelledby="authentication-required-title">
          <Icon name="account" />
          <h1 id="authentication-required-title">Sign in required</h1>
          <p>An authenticated Tabular session is required before files or database metadata can be shown.</p>
          <button type="button" disabled aria-disabled="true">Identity provider not configured</button>
        </section>
      </main>
      <footer className="explorer-status"><span><i data-status={data.status} />Protected application boundary</span><output>Live provider configuration is a deployment input</output><span>v{data.version}</span></footer>
    </div>
  );
}

export default function ActivityView({ data, provider }: ActivityViewProps) {
  return (
    <Provider {...provider}>
      {data.surface === 'auth-required'
        ? <AuthenticationRequired data={data} />
        : <ActivityPage {...data} />}
    </Provider>
  );
}
