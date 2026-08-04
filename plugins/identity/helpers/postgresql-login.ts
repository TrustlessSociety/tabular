import type { ClientConfig, QueryResultRow } from 'pg';
import pg from 'pg';
import type { VerifiedProviderSubject } from './contracts.js';
import { IdentityProviderAdapter } from './contracts.js';

const { Client } = pg;

export type PostgreSqlLoginCredentials = {
  roleName: string;
  password: string;
};

export type VerifiedPostgreSqlSubject = VerifiedProviderSubject & {
  readonly databaseOid: string;
  readonly roleOid: string;
  readonly roleName: string;
};

export type PostgreSqlLoginClient = {
  connect(): Promise<unknown>;
  query<Row extends QueryResultRow>(query: string): Promise<{ rows: Row[] }>;
  end(): Promise<void>;
};

export type PostgreSqlLoginClientFactory = (
  config: ClientConfig
) => PostgreSqlLoginClient;

type PostgreSqlLoginIdentityRow = {
  database_oid: string | number;
  role_oid: string | number;
  role_name: string;
  rolsuper: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolcanlogin: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  direct_session: boolean;
};

/** Verifies one PostgreSQL LOGIN role through an isolated ordinary connection. */
export class PostgreSqlIdentityProvider extends IdentityProviderAdapter<
  PostgreSqlLoginCredentials
> {
  public constructor(
    private readonly connectionId: string,
    private readonly connectionString: string,
    private readonly connectionTimeoutMs: number,
    private readonly clientFactory: PostgreSqlLoginClientFactory = defaultClientFactory
  ) {
    super('postgresql', `urn:tabular:postgresql:${connectionId}`);
  }

  /** Authenticates the submitted role without returning or retaining its password. */
  public async verify(
    input: PostgreSqlLoginCredentials
  ): Promise<VerifiedPostgreSqlSubject> {
    const roleName = loginRoleName(input.roleName);
    const password = loginPassword(input.password);
    const loginUrl = new URL(this.connectionString);
    loginUrl.username = roleName;
    loginUrl.password = password;
    const client = this.clientFactory({
      connectionString: loginUrl.toString(),
      application_name: `tabular-login-${this.connectionId}`,
      connectionTimeoutMillis: Math.min(this.connectionTimeoutMs, 5_000),
      query_timeout: Math.min(this.connectionTimeoutMs, 5_000)
    });

    try {
      await client.connect();
      const result = await client.query<PostgreSqlLoginIdentityRow>(`
        SELECT d.oid AS database_oid,
               r.oid AS role_oid,
               r.rolname::text AS role_name,
               r.rolsuper,
               r.rolcreaterole,
               r.rolcreatedb,
               r.rolcanlogin,
               r.rolreplication,
               r.rolbypassrls,
               current_user = session_user AS direct_session
          FROM pg_database d
          JOIN pg_roles r ON r.rolname = current_user
         WHERE d.datname = current_database()
      `);
      const identity = result.rows[0];
      if (!identity || identity.role_name !== roleName) {
        throw new Error('PostgreSQL login identity was not verified');
      }
      assertSafeLoginRole(identity);
      const databaseOid = String(identity.database_oid);
      const roleOid = String(identity.role_oid);
      return Object.freeze({
        ...this.verifiedSubject({
          subject: `${databaseOid}:${roleOid}`,
          displayName: identity.role_name
        }),
        databaseOid,
        roleOid,
        roleName: identity.role_name
      });
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

/** Creates the production short-lived PostgreSQL client. */
function defaultClientFactory(config: ClientConfig): PostgreSqlLoginClient {
  return new Client(config);
}

/** Rejects dangerous or indirect PostgreSQL login roles. */
function assertSafeLoginRole(role: PostgreSqlLoginIdentityRow) {
  if (
    role.rolsuper !== false
    || role.rolcreaterole !== false
    || role.rolcreatedb !== false
    || role.rolcanlogin !== true
    || role.rolreplication !== false
    || role.rolbypassrls !== false
    || role.direct_session !== true
  ) {
    throw new Error('PostgreSQL login role is unsafe');
  }
}

/** Validates a bounded PostgreSQL role name without normalizing its identity. */
function loginRoleName(value: string) {
  if (
    typeof value !== 'string'
    || value !== value.trim()
    || value.length < 1
    || Buffer.byteLength(value, 'utf8') > 63
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error('PostgreSQL login role is invalid');
  }
  return value;
}

/** Accepts a password only for the lifetime of one authentication call. */
function loginPassword(value: string) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 1_024
    || value.includes('\u0000')
  ) {
    throw new Error('PostgreSQL login password is invalid');
  }
  return value;
}
