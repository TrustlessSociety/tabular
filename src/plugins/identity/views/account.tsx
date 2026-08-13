//client
import type { BrowserProviderProjection } from '../../app/helpers/projection.js';
import Provider from '../../app/components/Provider.js';


type AccountViewProps = {
  data: { csrfToken: string, displayName: string },
  provider: BrowserProviderProjection,
};

export function Head({ styles = [] }: { styles?: string[] }) {
  return (
    <>
      <title>Account — Tabular</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {[...styles, '/styles/base.css', '/styles/identity.css'].map((href) => <link key={href} rel="stylesheet" type="text/css" href={href} />)}
    </>
  );
}

export default function AccountView({ data, provider }: AccountViewProps) {
  return (
    <Provider {...provider}>
      <div className="auth-page">
        <main className="auth-page__main" aria-labelledby="signed-in-title">
        <section className="auth-card auth-card--account">
          <header className="auth-card__header">
            <div className="auth-brand"><strong>Tabular</strong></div>
            <p className="auth-card__eyebrow">Workspace account</p>
            <h1 id="signed-in-title">Account</h1>
            <p className="auth-card__copy">Your browser session is bound to a verified PostgreSQL identity.</p>
          </header>
          <div className="auth-account">
            <span className="auth-account__label">Signed in as</span>
            <strong id="signed-in-identity">{data.displayName}</strong>
          </div>
          <div className="auth-actions">
            <a className="auth-secondary-action" href="/" title="Return to files">Return to files</a>
            <form id="logout-form" method="post" action="/auth/logout">
              <input name="csrfToken" type="hidden" value={data.csrfToken} />
              <button className="auth-primary-action" id="logout-submit" type="submit">Sign out</button>
            </form>
          </div>
        </section>
        </main>
      </div>
    </Provider>
  );
}
