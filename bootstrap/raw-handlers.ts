import type { IncomingMessage, ServerResponse } from 'node:http';

export type RawHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<void> | void;

export type RawHttpHandlerRegistration = {
  method: string;
  path: string;
  handle: RawHttpHandler;
};

/** Owns raw Node request handlers that must run before Ingest body adaptation. */
export class RawHttpHandlerRegistry {
  readonly #handlers = new Map<string, RawHttpHandler>();

  get routes() {
    return [...this.#handlers.keys()].sort();
  }

  register(registration: RawHttpHandlerRegistration) {
    const method = normalizeMethod(registration.method);
    const routePath = normalizePath(registration.path);
    const key = routeKey(method, routePath);
    if (this.#handlers.has(key)) {
      throw new Error(`Raw HTTP handler already registered: ${key}`);
    }
    this.#handlers.set(key, registration.handle);
  }

  async dispatch(request: IncomingMessage, response: ServerResponse) {
    const method = normalizeMethod(request.method || 'GET');
    const routePath = new URL(request.url || '/', 'http://tabular.invalid').pathname;
    const handler = this.#handlers.get(routeKey(method, routePath));
    if (!handler) return false;
    await handler(request, response);
    return true;
  }
}

function normalizeMethod(value: string) {
  const method = value.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw new Error('Raw HTTP method is invalid');
  return method;
}

function normalizePath(value: string) {
  if (!value.startsWith('/') || value.includes('?') || value.includes('#')) {
    throw new Error('Raw HTTP handler path must be an absolute pathname');
  }
  return value;
}

function routeKey(method: string, routePath: string) {
  return `${method} ${routePath}`;
}
