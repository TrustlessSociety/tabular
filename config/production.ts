import type { DatabaseConfig } from './database.js';
import type { EnvironmentConfig } from './environment.js';
import type { SessionConfig } from './sessions.js';

export type ProductionValidationConfig = {
  requireHttps: true;
  requireSecureCookies: true;
  requireSeparateDatabaseAuthorities: true;
  developmentServerAllowed: false;
};

export const productionValidation: ProductionValidationConfig = {
  requireHttps: true,
  requireSecureCookies: true,
  requireSeparateDatabaseAuthorities: true,
  developmentServerAllowed: false
};

export type ProductionProcessScope = 'all' | 'web' | 'migrator' | 'worker';

export function assertProductionConfiguration(input: {
  productionIssues: readonly string[];
}) {
  if (input.productionIssues.length) {
    throw new Error(input.productionIssues.join('; '));
  }
}

export function productionConfigurationIssues(input: {
  environment: EnvironmentConfig;
  sessions: SessionConfig;
  database: DatabaseConfig;
}, scope: ProductionProcessScope = 'all') {
  if (input.environment.mode !== 'production') return [];
  const issues: string[] = [];
  if (!input.environment.publicOrigin?.startsWith('https://')) {
    issues.push('TABULAR_PUBLIC_ORIGIN must use HTTPS in production');
  }
  if (!input.sessions.secure) {
    issues.push('Production sessions must use Secure cookies');
  }
  if (input.database.connectionId === 'local') {
    issues.push('TABULAR_DATABASE_CONNECTION_ID must identify the production database target');
  }
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
      issues.push(`The ${name} PostgreSQL authority cannot override target credentials in query parameters`);
    }
    return [{ name, ...coordinates }];
  });
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

function databaseAuthority(value: string) {
  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') return undefined;
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
