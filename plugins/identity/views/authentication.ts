/**
 * Renders the normal signed-out PostgreSQL login document.
 */
export function renderPostgreSqlLogin(stylesheetHref: string, failed = false) {
  return document('Sign in — Tabular', `
    <main class="auth-page__main" aria-labelledby="postgres-login-title">
      <section class="auth-card">
        ${productHeader(
          'PostgreSQL workspace',
          'postgres-login-title',
          'Sign in to Tabular',
          'Use an existing PostgreSQL login role to open your governed workspace.'
        )}
        ${failed ? '<p class="auth-alert" id="postgres-login-error" role="alert">Sign-in failed. Check your credentials and access.</p>' : ''}
        <form class="auth-form" id="postgres-login-form" method="post" action="/auth/login">
          <div class="auth-field">
            <label for="postgres-role">PostgreSQL role</label>
            <input autocomplete="username" id="postgres-role" maxlength="63" name="username" required type="text" />
          </div>
          <div class="auth-field">
            <label for="postgres-password">Password</label>
            <input autocomplete="current-password" id="postgres-password" maxlength="1024" name="password" required type="password" />
          </div>
          <button class="auth-primary-action" id="postgres-login-submit" type="submit">
            Sign in
          </button>
        </form>
        <footer class="auth-card__footer">
          Accounts and passwords remain managed by your PostgreSQL administrator.
        </footer>
      </section>
    </main>
  `, stylesheetHref);
}

/**
 * Renders a signed-in identity and a server-revoking logout form.
 */
export function renderSignedInAccount(
  stylesheetHref: string,
  displayName: string,
  csrfToken: string
) {
  return document('Account — Tabular', `
    <main class="auth-page__main" aria-labelledby="signed-in-title">
      <section class="auth-card auth-card--account">
        ${productHeader(
          'Workspace account',
          'signed-in-title',
          'Account',
          'Your browser session is bound to a verified PostgreSQL identity.'
        )}
        <div class="auth-account">
          <span class="auth-account__label">Signed in as</span>
          <strong id="signed-in-identity">${escapeHtml(displayName)}</strong>
        </div>
        <div class="auth-actions">
          <a class="auth-secondary-action" href="/" title="Return to files">
            Return to files
          </a>
          <form id="logout-form" method="post" action="/auth/logout">
            <input name="csrfToken" type="hidden" value="${escapeHtml(csrfToken)}" />
            <button class="auth-primary-action" id="logout-submit" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  `, stylesheetHref);
}

/**
 * Renders the shared Tabular identity heading.
 */
function productHeader(eyebrow: string, titleId: string, title: string, copy: string) {
  return `<header class="auth-card__header">
    <div class="auth-brand">
      <span class="auth-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1"></rect>
          <rect x="14" y="3" width="7" height="7" rx="1"></rect>
          <rect x="3" y="14" width="7" height="7" rx="1"></rect>
          <rect x="14" y="14" width="7" height="7" rx="1"></rect>
        </svg>
      </span>
      <strong>Tabular</strong>
    </div>
    <p class="auth-card__eyebrow">${escapeHtml(eyebrow)}</p>
    <h1 id="${escapeHtml(titleId)}">${escapeHtml(title)}</h1>
    <p class="auth-card__copy">${escapeHtml(copy)}</p>
  </header>`;
}

/**
 * Wraps identity content in a minimal CSP-compatible HTML document.
 */
function document(title: string, body: string, stylesheetHref: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link href="${escapeHtml(stylesheetHref)}" rel="stylesheet" type="text/css" />
  </head>
  <body class="auth-page">${body}</body>
</html>`;
}

/**
 * Escapes the two dynamic values permitted in the account document.
 */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]!);
}
