/** Renders the normal signed-out PostgreSQL login document. */
export function renderPostgreSqlLogin(failed = false) {
  return document('Sign in — Tabular', `
    <main aria-labelledby="postgres-login-title">
      <p><strong>Tabular</strong></p>
      <h1 id="postgres-login-title">Sign in to Tabular</h1>
      <p>Use an existing PostgreSQL login role. Database administrators manage accounts and passwords.</p>
      ${failed ? '<p id="postgres-login-error" role="alert">Sign-in failed. Check your credentials and access.</p>' : ''}
      <form id="postgres-login-form" method="post" action="/auth/login">
        <p>
          <label for="postgres-role">PostgreSQL role</label><br />
          <input id="postgres-role" name="username" type="text" autocomplete="username" required maxlength="63" />
        </p>
        <p>
          <label for="postgres-password">Password</label><br />
          <input id="postgres-password" name="password" type="password" autocomplete="current-password" required maxlength="1024" />
        </p>
        <button id="postgres-login-submit" type="submit">Sign in</button>
      </form>
    </main>
  `);
}

/** Renders a signed-in identity and a server-revoking logout form. */
export function renderSignedInAccount(displayName: string, csrfToken: string) {
  return document('Account — Tabular', `
    <main aria-labelledby="signed-in-title">
      <p><strong>Tabular</strong></p>
      <h1 id="signed-in-title">Account</h1>
      <p>Signed in as <strong id="signed-in-identity">${escapeHtml(displayName)}</strong></p>
      <p><a href="/">Return to files</a></p>
      <form id="logout-form" method="post" action="/auth/logout">
        <input type="hidden" name="csrfToken" value="${escapeHtml(csrfToken)}" />
        <button id="logout-submit" type="submit">Sign out</button>
      </form>
    </main>
  `);
}

/** Wraps identity content in a minimal CSP-compatible HTML document. */
function document(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>${body}</body>
</html>`;
}

/** Escapes the two dynamic values permitted in the account document. */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]!);
}
