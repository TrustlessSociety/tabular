import './proof.css';
import { useState } from 'react';

export type ProofPageProps = {
  authenticated: boolean;
  capability: 'tabular.capability';
  csrfToken?: string;
  expectedVersion?: number;
  recordId?: number;
};

export function Head({ styles = [] }: { styles?: string[] }) {
  return (
    <>
      <title>Tabular direct-library proof</title>
      <meta
        name="description"
        content="Ingest, Inquire, Reactus, and lib direct composition proof"
      />
      {styles.map((href) => (
        <link key={href} rel="stylesheet" type="text/css" href={href} />
      ))}
    </>
  );
}

export default function ProofPage(props: ProofPageProps) {
  const [status, setStatus] = useState(
    props.authenticated ? 'Authenticated proof session' : 'Sign in to proof'
  );
  const [recordName, setRecordName] = useState('Quarterly Plan');
  const [version, setVersion] = useState(props.expectedVersion || 1);

  async function signIn() {
    const response = await fetch('/proof/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ credential: 'proof-secret' })
    });
    if (!response.ok) {
      setStatus(`Sign-in denied (${response.status})`);
      return;
    }
    window.location.reload();
  }

  async function rename(csrfToken = props.csrfToken || '') {
    const response = await fetch('/proof/rename', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        id: props.recordId,
        name: 'Roadmap 2026',
        expectedVersion: version
      })
    });
    const body = await response.json();
    if (!response.ok) {
      setStatus(`Mutation denied (${response.status}): ${body.error}`);
      return;
    }
    setRecordName(body.name);
    setVersion(body.version);
    setStatus('Authorized mutation committed');
  }

  async function signOut() {
    const response = await fetch('/proof/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': props.csrfToken || '' }
    });
    setStatus(response.ok ? 'Session revoked' : `Logout denied (${response.status})`);
  }

  return (
    <main>
      <header>
        <p className="eyebrow">SPEC 00003 · P-001</p>
        <h1>Direct Stackpress libraries</h1>
        <p className="lede">
          Ingest routes, Reactus rendering and hydration, an Inquire/PGlite
          transaction, and a lib event meet at one explicit capability.
        </p>
      </header>

      <section aria-labelledby="boundary-title">
        <h2 id="boundary-title">Owned boundaries</h2>
        <dl>
          <div><dt>HTTP</dt><dd>@stackpress/ingest</dd></div>
          <div><dt>Rendering</dt><dd>reactus</dd></div>
          <div><dt>SQL</dt><dd>@stackpress/inquire</dd></div>
          <div><dt>Events</dt><dd>@stackpress/lib</dd></div>
        </dl>
      </section>

      <section className="proof-card" aria-live="polite">
        <div>
          <p className="label">Capability</p>
          <strong>{props.capability}</strong>
        </div>
        <div>
          <p className="label">Status</p>
          <strong data-testid="status">{status}</strong>
        </div>
        {props.authenticated ? (
          <>
            <div>
              <p className="label">Record</p>
              <strong data-testid="record-name">{recordName}</strong>
              <span>version {version}</span>
            </div>
            <div className="actions">
              <button data-testid="rename" onClick={() => rename()}>
                Rename through capability
              </button>
              <button className="secondary" data-testid="invalid-csrf" onClick={() => rename('invalid')}>
                Try invalid CSRF
              </button>
              <button className="quiet" data-testid="logout" onClick={signOut}>
                Revoke session
              </button>
            </div>
          </>
        ) : (
          <button data-testid="login" onClick={signIn}>Use proof identity</button>
        )}
      </section>

      <aside>
        This is architecture evidence, not the Tabular production UI. The proof
        identity is a labeled test double, and local HTTP intentionally omits
        the production-only Secure cookie attribute.
      </aside>
    </main>
  );
}
