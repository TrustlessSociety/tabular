//modules
import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

//client
import type {
  BrowserData,
  BrowserProviderProjection,
  BrowserRequest,
  BrowserResponse,
  BrowserSession
} from '../helpers/projection.js';

//The Provider props preserve the shared hook surface while accepting only the
// already projected browser value.
export type ProviderProps = BrowserProviderProjection & {
  children: ReactNode,
};

const ProviderContext = createContext<BrowserProviderProjection>({
  data: {
    application: { name: 'Tabular', version: '0.0.0' },
    language: { locale: 'en-US', language: 'English' },
    brand: { name: 'Tabular' },
    theme: 'light',
    shell: { status: 'starting', title: 'Tabular', density: 'comfortable' }
  },
  request: { method: 'GET', path: '/', route: {} },
  session: { authenticated: false, capabilities: {} },
  response: { code: 0, status: '' }
});

/**
 * Provide the typed browser projection to app-owned React components.
 */
export default function Provider(props: ProviderProps) {
  const { children, data, request, session, response } = props;
  return (
    <ProviderContext.Provider value={{ data, request, session, response }}>
      {children}
    </ProviderContext.Provider>
  );
}

/**
 * Return public application, language, brand, theme, and shell data.
 */
export function useData(): BrowserData {
  return useContext(ProviderContext).data;
}

/**
 * Return the public language projection.
 */
export function useLanguage() {
  return useData().language;
}

/**
 * Return the projected request path and allowlisted route state.
 */
export function useRequest(): BrowserRequest {
  return useContext(ProviderContext).request;
}

/**
 * Return response code and status without raw response headers.
 */
export function useResponse(): BrowserResponse {
  return useContext(ProviderContext).response;
}

/**
 * Return display identity, presentation flags, and explicit CSRF state.
 */
export function useSession(): BrowserSession {
  return useContext(ProviderContext).session;
}
