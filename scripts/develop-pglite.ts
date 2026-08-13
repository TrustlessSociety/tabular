//node
import assert from 'node:assert/strict';

//client
import type { DevelopmentLoginProvider } from '../src/plugins/identity/helpers/service.js';
import type { DevelopmentDatabaseBackend } from '../src/plugins/database/helpers/development-contracts.js';
import type { PostgreSqlLoginCredentials, VerifiedPostgreSqlSubject } from '../src/plugins/identity/helpers/postgresql-login.js';
import type { PostgreSqlTransactionOptions } from '../src/plugins/database/helpers/transactions.js';
import { DatabaseExecutor } from '../src/plugins/database/helpers/executor.js';
import { withDevelopmentTransaction } from '../src/plugins/database/helpers/development-transaction.js';
import { seedLocalDemo } from '../src/plugins/database/helpers/demo-seed.js';
import { runMigrations } from '../src/plugins/database/helpers/migrator.js';
import { loadMigrations } from '../src/plugins/database/migrations/index.js';
import { IdentityProviderAdapter } from '../src/plugins/identity/helpers/contracts.js';

const DEMO_USERNAME = 'tabular_reviewer';
const DEMO_PASSWORD = 'review-local-only-2026';
const DEMO_MEMBER_ROLE = 'tabular_review_member';

//The development-only runtime return contract keeps the dynamic adapter out
//of every production source entrypoint.
export type PGliteDevelopmentRuntime = {
  backend: DevelopmentDatabaseBackend,
  login: DevelopmentLoginProvider,
  close: () => Promise<void>,
};

/**
 * Create, migrate, authorize, and seed one in-memory PGlite runtime.
 */
export async function createPGliteDevelopmentRuntime(): Promise<PGliteDevelopmentRuntime> {
  //These packages are resolved only after scripts/develop.ts has selected the
  //URL-less development process; they never enter the server build graph.
  const { PGlite } = await import('@electric-sql/pglite');
  const PGLiteConnection = (await import('@stackpress/inquire-pglite/Connection')).default;
  const resource = new PGlite();
  await resource.waitReady;
  const database = new DatabaseExecutor(new PGLiteConnection(resource));
  let queue = Promise.resolve();
  let closed = false;

  //Serialize transactions because one in-memory PGlite instance owns one
  //session and must never interleave BEGIN/COMMIT boundaries.
  const backend: DevelopmentDatabaseBackend = {
    async transaction<Result, FinalResult = Result>(
      options: PostgreSqlTransactionOptions<Result, FinalResult>,
      callback: (database: DatabaseExecutor) => Promise<Result>
    ) {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await withDevelopmentTransaction(database, options, callback);
      } finally {
        release();
      }
    },
    async ready() {
      if (closed) return false;
      await database.execute('SELECT 1 AS ready');
      return true;
    },
    async close() {
      if (closed) return;
      closed = true;
      await resource.close();
    }
  };

  try {
    //Create the same safe login/member relationship used by local review;
    //PGlite validates the submitted development password in the injected
    //provider because it does not expose a network password-auth endpoint.
    await createDevelopmentRoles(database);
    await runMigrations(
      (callback) => backend.transaction({}, callback),
      await loadMigrations(),
      { advisoryLock: false }
    );
    await grantRuntimeAuthority(database);
    await backend.transaction({}, (transaction) =>
      seedLocalDemo(transaction, DEMO_MEMBER_ROLE, 'local')
    );

    const subject = await developmentSubject(database);
    const provider = new PGliteLoginProvider(subject);
    return {
      backend,
      login: (input) => provider.verify(input),
      close: () => backend.close()
    };
  } catch (error) {
    await backend.close();
    throw error;
  }
}

/**
 * Create the fixed safe roles used by the disposable development dataset.
 */
async function createDevelopmentRoles(database: DatabaseExecutor) {
  await database.execute(`CREATE ROLE ${DEMO_USERNAME} LOGIN`);
  await database.execute(`CREATE ROLE ${DEMO_MEMBER_ROLE} NOLOGIN`);
  await database.execute(
    `GRANT ${DEMO_MEMBER_ROLE} TO ${DEMO_USERNAME} WITH INHERIT FALSE, SET TRUE`
  );
}

/**
 * Grant the runtime authority needed while transactions assume the member role.
 */
async function grantRuntimeAuthority(database: DatabaseExecutor) {
  await database.execute(`GRANT USAGE ON SCHEMA tabular TO ${DEMO_MEMBER_ROLE}`);
  await database.execute(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tabular `
    + `TO ${DEMO_MEMBER_ROLE}`
  );
  await database.execute(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabular TO ${DEMO_MEMBER_ROLE}`
  );
  await database.execute(
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tabular TO ${DEMO_MEMBER_ROLE}`
  );
}

/**
 * Read the verified PGlite database and login role coordinates.
 */
async function developmentSubject(database: DatabaseExecutor): Promise<VerifiedPostgreSqlSubject> {
  const result = await database.execute<{
    database_oid: string | number,
    role_oid: string | number,
    role_name: string,
    rolcanlogin: boolean,
    rolsuper: boolean,
    rolcreaterole: boolean,
    rolcreatedb: boolean,
    rolreplication: boolean,
    rolbypassrls: boolean,
  }>(`
    SELECT database.oid::text AS database_oid,
           role.oid::text AS role_oid,
           role.rolname::text AS role_name,
           role.rolcanlogin,
           role.rolsuper,
           role.rolcreaterole,
           role.rolcreatedb,
           role.rolreplication,
           role.rolbypassrls
      FROM pg_database AS database
      JOIN pg_roles AS role ON role.rolname = ?
     WHERE database.datname = current_database()
  `, [DEMO_USERNAME]);
  const row = result.rows[0];
  assert.ok(row, 'PGlite development login role was not created');
  if (
    !row.rolcanlogin
    || row.rolsuper
    || row.rolcreaterole
    || row.rolcreatedb
    || row.rolreplication
    || row.rolbypassrls
  ) {
    throw new Error('PGlite development login role is unsafe');
  }
  return {
    provider: 'postgresql',
    issuer: 'urn:tabular:postgresql:local',
    subject: `${row.database_oid}:${row.role_oid}`,
    displayName: row.role_name,
    authenticatedAt: new Date(),
    databaseOid: String(row.database_oid),
    roleOid: String(row.role_oid),
    roleName: row.role_name
  } as VerifiedPostgreSqlSubject;
}

class PGliteLoginProvider extends IdentityProviderAdapter<PostgreSqlLoginCredentials> {
  /**
   * Create a fixed development credential verifier.
   */
  public constructor(private readonly subject: VerifiedPostgreSqlSubject) {
    super('postgresql', 'urn:tabular:postgresql:local');
  }

  /**
   * Verify only the documented disposable development credential.
   */
  public async verify(input: PostgreSqlLoginCredentials) {
    if (input.roleName !== DEMO_USERNAME || input.password !== DEMO_PASSWORD) {
      throw new Error('Development credentials were rejected');
    }
    return {
      ...this.verifiedSubject({
        subject: this.subject.subject,
        displayName: this.subject.displayName
      }),
      databaseOid: this.subject.databaseOid,
      roleOid: this.subject.roleOid,
      roleName: this.subject.roleName
    };
  }
}
