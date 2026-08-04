let currentToken: string | undefined;

/**
 * Browser reads rotate bounded CSRF credentials. Keep transports on the newest
 * response credential without placing it in URLs, logs, or mutable page data.
 */
export function rememberBrowserCsrfToken(value: string | null | undefined) {
  if (typeof value === 'string' && value.length >= 32 && value.length <= 256) {
    currentToken = value;
  }
}

export function browserCsrfToken(fallback: string) {
  return currentToken || fallback;
}
