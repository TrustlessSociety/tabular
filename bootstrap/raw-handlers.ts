//node
import type { IncomingMessage, ServerResponse } from 'node:http';

//The raw http handler contract exported for module callers
export type RawHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void> | void;

//The raw http handler registration contract exported for module callers
export type RawHttpHandlerRegistration = {
  method: string,
  path: string,
  handle: RawHttpHandler,
};

/**
 * Owns raw Node request handlers that must run before Ingest body adaptation.
 */
export class RawHttpHandlerRegistry {
  //The normalized method-path keys route requests before Ingest body parsing
  readonly #handlers = new Map<string, RawHttpHandler>();

  /**
   * Return the registered raw routes in deterministic diagnostic order.
   */
  public get routes() {
    return [...this.#handlers.keys()].sort();
  }

  /**
   * Register one unique raw handler under its normalized method and path.
   */
  public register(registration: RawHttpHandlerRegistration) {
    //normalize both coordinates before detecting duplicate ownership
    const method = normalizeMethod(registration.method);
    const routePath = normalizePath(registration.path);
    const key = routeKey(method, routePath);
    if (this.#handlers.has(key)) {
      throw new Error(`Raw HTTP handler already registered: ${key}`);
    }
    this.#handlers.set(key, registration.handle);
  }

  /**
   * Dispatch a matching raw request before generic request adaptation.
   */
  public async dispatch(request: IncomingMessage, response: ServerResponse) {
    //URL parsing strips query state while retaining the exact pathname owner
    const method = normalizeMethod(request.method || 'GET');
    const routePath = new URL(request.url || '/', 'http://tabular.invalid').pathname;
    const handler = this.#handlers.get(routeKey(method, routePath));

    //a miss returns control to the normal Ingest request pipeline
    if (!handler) return false;
    await handler(request, response);
    return true;
  }
}

/**
 * Normalize and validate one raw HTTP method token.
 */
function normalizeMethod(value: string) {
  const method = value.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new Error('Raw HTTP method is invalid');
  return method;
}

/**
 * Validate one absolute raw-handler pathname without query or fragment state.
 */
function normalizePath(value: string) {
  if (!value.startsWith('/') || value.includes('?') || value.includes('#')) {
    throw new Error('Raw HTTP handler path must be an absolute pathname');
  }
  return value;
}

/**
 * Build the collision-safe registry key for one method and pathname.
 */
function routeKey(method: string, routePath: string) {
  return `${method} ${routePath}`;
}
