import type { Response } from '@stackpress/ingest/http';
import type { ApplicationRuntimeService } from '../../../bootstrap/application.js';
import { versionPublicArtifactReferences } from './assets.js';

/** Renders the shared signed-out shell without granting a product session. */
export async function renderAuthenticationRequired(
  response: Response,
  _runtime: ApplicationRuntimeService
) {
  response.headers.set('Cache-Control', 'no-store');
  response.redirect('/auth/login', 303);
}

/** Renders one feature-owned page through the shared Reactus application shell. */
export async function renderProductPage(
  response: Response,
  runtime: ApplicationRuntimeService,
  page: Record<string, unknown>,
  code = 200
) {
  const resources = await runtime.resources.readiness();
  const status = runtime.lifecycle.phase === 'ready' && resources.ready ? 'ready' : 'starting';
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
  if (!runtime.reactus) throw new Error('Reactus is available only in the web process');
  const html = await runtime.reactus.render(runtime.config.reactus.entry, {
    application: 'Tabular',
    status,
    version: runtime.config.app.version,
    ...page
  });
  response.html(versionPublicArtifactReferences(html, runtime.artifacts), code);
}
