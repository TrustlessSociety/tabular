//modules
//client
import type { BrowserProviderProjection } from '../../app/helpers/projection.js';
import Provider from '../../app/components/Provider.js';


type LoginViewProps = {
  data: { failed?: boolean },
  provider: BrowserProviderProjection,
};

export function Head({ styles = [] }: { styles?: string[] }) {
  return (
    <>
      <title>Sign in — Tabular</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {[...styles, '/styles/base.css', '/styles/identity.css'].map((href) => <link key={href} rel="stylesheet" type="text/css" href={href} />)}
    </>
  );
}

export default function LoginView({ data, provider }: LoginViewProps) {
  return (
    <Provider {...provider}>
      <div className="auth-page">
        <main className="auth-page__main" aria-labelledby="postgres-login-title">
        <section className="auth-card">
          <header className="auth-card__header">
            <div className="auth-brand"><strong>Tabular</strong></div>
            <p className="auth-card__eyebrow">PostgreSQL workspace</p>
            <h1 id="postgres-login-title">Sign in to Tabular</h1>
            <p className="auth-card__copy">Use an existing PostgreSQL login role to open your governed workspace.</p>
          </header>
          {data.failed && <p className="auth-alert" id="postgres-login-error" role="alert">Sign-in failed. Check your credentials and access.</p>}
          <form className="auth-form" id="postgres-login-form" method="post" action="/auth/login">
            <div className="auth-field">
              <label htmlFor="postgres-role">PostgreSQL role</label>
              <input autoComplete="username" id="postgres-role" maxLength={63} name="username" required type="text" />
            </div>
            <div className="auth-field">
              <label htmlFor="postgres-password">Password</label>
              <input autoComplete="current-password" id="postgres-password" maxLength={1024} name="password" required type="password" />
            </div>
            <button className="auth-primary-action" id="postgres-login-submit" type="submit">Sign in</button>
          </form>
          <footer className="auth-card__footer">Accounts and passwords remain managed by your PostgreSQL administrator.</footer>
        </section>
        </main>
      </div>
    </Provider>
  );
}
