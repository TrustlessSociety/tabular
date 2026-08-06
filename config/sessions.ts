//client
import type { AppEnvironment } from './environment.js';

//The session config contract exported for module callers
export type SessionConfig = {
  cookieName: string,
  secure: boolean,
  httpOnly: true,
  sameSite: 'strict',
  maxAgeSeconds: number,
  idleTimeoutSeconds: number,
};

/**
 * Load cookie and expiration settings for the current environment mode.
 */
export function loadSessionConfig(
  env: NodeJS.ProcessEnv,
  mode: AppEnvironment
): SessionConfig {
  //coerce both durations once before applying their shared minimum lifetime
  const maxAgeSeconds = Number(env.TABULAR_SESSION_MAX_AGE_SECONDS || 28_800);
  const idleTimeoutSeconds = Number(env.TABULAR_SESSION_IDLE_TIMEOUT_SECONDS || 1_800);
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 60) {
    throw new Error('TABULAR_SESSION_MAX_AGE_SECONDS must be an integer of at least 60');
  }
  if (!Number.isInteger(idleTimeoutSeconds) || idleTimeoutSeconds < 60) {
    throw new Error('TABULAR_SESSION_IDLE_TIMEOUT_SECONDS must be an integer of at least 60');
  }

  //production uses the host-only cookie prefix and requires secure transport;
  // local review retains the same HTTP-only and strict same-site protections
  return {
    cookieName: mode === 'production' ? '__Host-tabular' : 'tabular_session',
    secure: mode === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAgeSeconds,
    idleTimeoutSeconds
  };
}
