//client
import type { DatabaseConfig } from './database.js';
import type { EnvironmentConfig } from './environment.js';
import type { SessionConfig } from './sessions.js';

//The production validation config contract exported for module callers
export type ProductionValidationConfig = {
  requireHttps: true,
  requireSecureCookies: true,
  requireSeparateDatabaseAuthorities: true,
  developmentServerAllowed: false,
};

//The production validation value exported for module callers
export const productionValidation: ProductionValidationConfig = {
  requireHttps: true,
  requireSecureCookies: true,
  requireSeparateDatabaseAuthorities: true,
  developmentServerAllowed: false
};

//The production process scope contract exported for module callers
export type ProductionProcessScope = 'all' | 'web' | 'migrator' | 'worker';

/**
 * Throw one aggregated error when production validation found any issue.
 */
export function assertProductionConfiguration(input: {
  productionIssues: readonly string[],
}) {
  //keep the caller-facing failure complete instead of revealing issues one run
  // at a time
  if (input.productionIssues.length) {
    throw new Error(input.productionIssues.join('; '));
  }
}

/**
 * Return every production configuration issue for the requested process scope.
 */
export function productionConfigurationIssues(input: {
  environment: EnvironmentConfig,
  sessions: SessionConfig,
  database: DatabaseConfig,
}, scope: ProductionProcessScope = 'all') {
  //development and test deliberately use the less restrictive local contract
  if (input.environment.mode !== 'production') return [];

  //collect shared HTTPS, cookie, and target-identity requirements first
  const issues: string[] = [];
  if (!input.environment.publicOrigin?.startsWith('https://')) {
    issues.push('TABULAR_PUBLIC_ORIGIN must use HTTPS in production');
  }
  if (!input.sessions.secure) {
    issues.push('Production sessions must use Secure cookies');
  }
  if (input.database.connectionId === 'local') {
    issues.push(
      'TABULAR_DATABASE_CONNECTION_ID must identify the production database target'
    );
  }

  //retain each process authority separately so scoped validation can require
  // only the credential owned by the current executable
  const authorities = [
    ['web', input.database.webUrl],
    ['migrator', input.database.migratorUrl],
    ['worker', input.database.workerUrl]
  ] as const;
  for (const [name, value] of authorities) {
    if ((scope === 'all' || scope === name) && !value) {
      issues.push(`TABULAR_${name.toUpperCase()}_DATABASE_URL is required in production`);
    }
  }

  //parse supplied authorities into non-secret coordinates before comparing
  // database targets and role separation
  const parsed = authorities.flatMap(([name, value]) => {
    if (!value) return [];
    const coordinates = databaseAuthority(value);
    if (!coordinates) {
      issues.push(`The ${name} PostgreSQL authority URL is invalid`);
      return [];
    }
    if (!coordinates.username) {
      issues.push(`The ${name} PostgreSQL authority must identify a database user`);
    }
    if (coordinates.hasAuthorityOverrides) {
      issues.push(
        `The ${name} PostgreSQL authority cannot override target credentials in query parameters`
      );
    }
    return [{ name, ...coordinates }];
  });

  //full-process validation also proves that all roles reach one database while
  // remaining distinct PostgreSQL authorities
  if (scope === 'all' && parsed.length === authorities.length) {
    const targets = new Set(parsed.map((entry) => entry.target));
    if (targets.size !== 1) {
      issues.push('Web, worker, and migrator PostgreSQL authorities must target the same database');
    }
    const usernames = new Set(parsed.map((entry) => entry.username));
    if (usernames.size !== parsed.length) {
      issues.push('Web, worker, and migrator PostgreSQL authorities must use distinct database users');
    }
  }
  return issues;
}

/**
 * Reduce a PostgreSQL URL to the non-secret coordinates used for comparison.
 */
function databaseAuthority(value: string) {
  try {
    //URL parsing owns percent-decoding and rejects malformed authority syntax
    const parsed = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !parsed.hostname
      || !parsed.pathname
      || parsed.pathname === '/'
    ) return undefined;

    //credentials supplied through query parameters can override the reviewed
    // authority and therefore fail validation even when the base URL is valid
    const overrides = ['user', 'username', 'host', 'port', 'database', 'dbname', 'password'];
    return {
      username: decodeURIComponent(parsed.username),
      target: [
        parsed.protocol,
        parsed.hostname.toLowerCase(),
        parsed.port || '5432',
        decodeURIComponent(parsed.pathname)
      ].join('|'),
      hasAuthorityOverrides: overrides.some((key) => parsed.searchParams.has(key))
    };
  } catch {
    return undefined;
  }
}
