//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { VerifiedProviderSubject } from './contracts.js';
import type { VerifiedPostgreSqlSubject } from './postgresql-login.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { opaqueId } from './security.js';

type IdentityRow = {
  id: string,
  display_name: string | null,
  status: 'active' | 'disabled' | 'revoked',
  identity_generation: string | number,
};

//The session authority row contract exported for module callers
export type SessionAuthorityRow = {
  session_id: string,
  history_scope_id: string,
  identity_id: string,
  connection_id: string,
  display_name: string | null,
  token_hash: string,
  csrf_token_hash: string,
  idle_expires_at: Date | string,
  absolute_expires_at: Date | string,
  revoked_at: Date | string | null,
  identity_status: string,
  identity_generation: string | number,
  session_identity_generation: string | number,
  mapping_generation: string | number,
  session_mapping_generation: string | number,
  mapping_enabled: boolean,
  role_enabled: boolean,
  role_generation: string | number,
  configured_role_oid: string | number,
  allowed_role_id: string,
  live_role_oid: string | number | null,
  configured_role_name: string,
  live_role_name: string | null,
  rolsuper: boolean | null,
  rolcreaterole: boolean | null,
  rolcreatedb: boolean | null,
  rolcanlogin: boolean | null,
  rolreplication: boolean | null,
  rolbypassrls: boolean | null,
  same_database: boolean,
  idle_valid: boolean,
  absolute_valid: boolean,
  can_set_role: boolean,
  login_authority_valid?: boolean,
};

/**
 * Provide identity persistence operations.
 */
export class IdentityRepository {
  /**
   * Create a IdentityRepository instance.
   */
  public constructor(private readonly database: DatabaseExecutor) {}

  /**
   * Handle the provision identity operation.
   */
  public async provisionIdentity(subject: VerifiedProviderSubject) {
    const id = opaqueId('id');
    const result = await this.database.execute<IdentityRow>(`
      INSERT INTO tabular.identities (
        id, provider, issuer, provider_subject, display_name, last_authenticated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (provider, issuer, provider_subject) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          updated_at = transaction_timestamp(),
          last_authenticated_at = EXCLUDED.last_authenticated_at
      RETURNING id, display_name, status, identity_generation
    `, [
      id,
      subject.provider,
      subject.issuer,
      subject.subject,
      subject.displayName || null,
      subject.authenticatedAt
    ]);
    if (!result.rows[0]) throw new Error('Application identity was not returned');
    return result.rows[0];
  }

  /**
   * Bind the postgre SQL identity.
   */
  public async bindPostgreSqlIdentity(
    identityId: string,
    connectionId: string,
    subject: VerifiedPostgreSqlSubject
  ) {
    await this.database.execute(`
      INSERT INTO tabular.postgresql_login_identities (
        identity_id, connection_id, database_oid, role_oid, role_name
      ) VALUES (?, ?, CAST(? AS oid), CAST(? AS oid), ?)
      ON CONFLICT (identity_id) DO UPDATE
      SET connection_id = EXCLUDED.connection_id,
          database_oid = EXCLUDED.database_oid,
          role_oid = EXCLUDED.role_oid,
          role_name = EXCLUDED.role_name,
          updated_at = transaction_timestamp()
    `, [
      identityId,
      connectionId,
      subject.databaseOid,
      subject.roleOid,
      subject.roleName
    ]);
  }

  /**
   * Resolve the postgre SQL authorization role.
   */
  public async resolvePostgreSqlAuthorizationRole(subject: VerifiedPostgreSqlSubject) {
    const result = await this.database.execute<{
      database_oid: string | number,
      role_oid: string | number,
      role_name: string,
      rolsuper: boolean,
      rolcreaterole: boolean,
      rolcreatedb: boolean,
      rolcanlogin: boolean,
      rolreplication: boolean,
      rolbypassrls: boolean,
      base_role: boolean,
      can_set_role: boolean,
    }>(`
      SELECT d.oid AS database_oid,
             auth_role.oid AS role_oid,
             auth_role.rolname::text AS role_name,
             auth_role.rolsuper,
             auth_role.rolcreaterole,
             auth_role.rolcreatedb,
             auth_role.rolcanlogin,
             auth_role.rolreplication,
             auth_role.rolbypassrls,
             auth_role.rolname = session_user AS base_role,
             pg_has_role(session_user, auth_role.oid, 'SET') AS can_set_role
        FROM pg_database d
        JOIN pg_roles login_role ON login_role.oid = CAST(? AS oid)
        JOIN pg_roles auth_role ON auth_role.oid <> login_role.oid
       WHERE d.oid = CAST(? AS oid)
         AND d.datname = current_database()
         AND login_role.rolname = ?
         AND login_role.rolsuper = false
         AND login_role.rolcreaterole = false
         AND login_role.rolcreatedb = false
         AND login_role.rolcanlogin = true
         AND login_role.rolreplication = false
         AND login_role.rolbypassrls = false
         AND auth_role.rolsuper = false
         AND auth_role.rolcreaterole = false
         AND auth_role.rolcreatedb = false
         AND auth_role.rolcanlogin = false
         AND auth_role.rolreplication = false
         AND auth_role.rolbypassrls = false
         AND auth_role.rolname <> session_user
         AND pg_has_role(login_role.oid, auth_role.oid, 'MEMBER')
         AND pg_has_role(session_user, auth_role.oid, 'SET')
       ORDER BY auth_role.oid
       LIMIT 2
    `, [subject.roleOid, subject.databaseOid, subject.roleName]);
    if (result.rows.length !== 1) {
      throw new ApplicationError(
        'role_not_allowed',
        403,
        'The PostgreSQL login has no unambiguous safe authorization role'
      );
    }
    assertSafeRole(result.rows[0]);
    return result.rows[0];
  }

  /**
   * Handle the reserve postgre SQL login attempt operation.
   */
  public async reservePostgreSqlLoginAttempt(input: {
    attemptKeyHash: string,
    maximumAttempts: number,
    windowSeconds: number,
    blockSeconds: number,
  }) {
    const result = await this.database.execute<{ allowed: boolean, }>(`
      INSERT INTO tabular.postgresql_login_attempts (
        attempt_key_hash, attempt_count
      ) VALUES (?, 1)
      ON CONFLICT (attempt_key_hash) DO UPDATE
      SET attempt_count = CASE
            WHEN tabular.postgresql_login_attempts.blocked_until > clock_timestamp()
              THEN tabular.postgresql_login_attempts.attempt_count + 1
            WHEN clock_timestamp() >= tabular.postgresql_login_attempts.window_started_at
              + (? * interval '1 second') THEN 1
            ELSE tabular.postgresql_login_attempts.attempt_count + 1
          END,
          window_started_at = CASE
            WHEN tabular.postgresql_login_attempts.blocked_until <= clock_timestamp()
              OR clock_timestamp() >= tabular.postgresql_login_attempts.window_started_at
                + (? * interval '1 second') THEN clock_timestamp()
            ELSE tabular.postgresql_login_attempts.window_started_at
          END,
          blocked_until = CASE
            WHEN tabular.postgresql_login_attempts.blocked_until > clock_timestamp()
              THEN tabular.postgresql_login_attempts.blocked_until
            WHEN clock_timestamp() >= tabular.postgresql_login_attempts.window_started_at
              + (? * interval '1 second') THEN NULL
            WHEN tabular.postgresql_login_attempts.attempt_count + 1 > ?
              THEN clock_timestamp() + (? * interval '1 second')
            ELSE NULL
          END,
          updated_at = clock_timestamp()
      RETURNING attempt_count <= ?
        AND (blocked_until IS NULL OR blocked_until <= clock_timestamp()) AS allowed
    `, [
      input.attemptKeyHash,
      input.windowSeconds,
      input.windowSeconds,
      input.windowSeconds,
      input.maximumAttempts,
      input.blockSeconds,
      input.maximumAttempts
    ]);
    return result.rows[0]?.allowed === true;
  }

  /**
   * Clear the postgre SQL login attempts.
   */
  public async clearPostgreSqlLoginAttempts(attemptKeyHash: string) {
    await this.database.execute(`
      DELETE FROM tabular.postgresql_login_attempts WHERE attempt_key_hash = ?
    `, [attemptKeyHash]);
  }

  /**
   * Handle the allow role operation.
   */
  public async allowRole(connectionId: string, roleName: string) {
    const live = await this.database.execute<{
      database_oid: string | number,
      role_oid: string | number,
      role_name: string,
      rolsuper: boolean,
      rolcreaterole: boolean,
      rolcreatedb: boolean,
      rolcanlogin: boolean,
      rolreplication: boolean,
      rolbypassrls: boolean,
      base_role: boolean,
      can_set_role: boolean,
    }>(`
      SELECT d.oid AS database_oid,
             r.oid AS role_oid,
             r.rolname::text AS role_name,
             r.rolsuper,
             r.rolcreaterole,
             r.rolcreatedb,
             r.rolcanlogin,
             r.rolreplication,
             r.rolbypassrls,
             r.rolname = session_user AS base_role,
             pg_has_role(session_user, r.oid, 'SET') AS can_set_role
        FROM pg_database d
        JOIN pg_roles r ON r.rolname = ?
       WHERE d.datname = current_database()
    `, [roleName]);
    const role = live.rows[0];
    if (!role) throw new ApplicationError('role_not_allowed', 403, 'The mapped role is unavailable');
    assertSafeRole(role);
    const id = opaqueId('role');
    const stored = await this.database.execute<{ id: string, }>(`
      INSERT INTO tabular.allowed_roles (
        id, connection_id, database_oid, role_oid, role_name
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (connection_id, database_oid, role_oid) DO UPDATE
      SET role_name = EXCLUDED.role_name,
          enabled = true,
          role_generation = CASE
            WHEN tabular.allowed_roles.role_name = EXCLUDED.role_name
              AND tabular.allowed_roles.enabled
            THEN tabular.allowed_roles.role_generation
            ELSE tabular.allowed_roles.role_generation + 1
          END,
          updated_at = transaction_timestamp()
      RETURNING id
    `, [id, connectionId, role.database_oid, role.role_oid, role.role_name]);
    if (!stored.rows[0]) throw new Error('Allowed PostgreSQL role was not returned');
    return stored.rows[0].id;
  }

  /**
   * Map the identity.
   */
  public async mapIdentity(identityId: string, connectionId: string, allowedRoleId: string) {
    const current = await this.database.execute<{
      allowed_role_id: string,
      mapping_generation: string | number,
      enabled: boolean,
    }>(`
      SELECT allowed_role_id, mapping_generation, enabled
        FROM tabular.identity_role_mappings
       WHERE identity_id = ? AND connection_id = ?
       FOR UPDATE
    `, [identityId, connectionId]);
    const existing = current.rows[0];
    let changed = false;
    if (!existing) {
      await this.database.execute(`
        INSERT INTO tabular.identity_role_mappings (
          identity_id, connection_id, allowed_role_id
        ) VALUES (?, ?, ?)
      `, [identityId, connectionId, allowedRoleId]);
      changed = true;
    } else if (existing.allowed_role_id !== allowedRoleId || !existing.enabled) {
      await this.database.execute(`
        UPDATE tabular.identity_role_mappings
           SET allowed_role_id = ?,
               mapping_generation = mapping_generation + 1,
               enabled = true,
               updated_at = transaction_timestamp()
         WHERE identity_id = ? AND connection_id = ?
      `, [allowedRoleId, identityId, connectionId]);
      changed = true;
    }
    if (changed) {
      await this.revokeIdentitySessions(identityId, connectionId, 'role-remapped');
    }
  }

  /**
   * Resolve the login.
   */
  public async resolveLogin(identityId: string, connectionId: string) {
    const result = await this.database.execute<{
      identity_id: string,
      display_name: string | null,
      identity_generation: string | number,
      allowed_role_id: string,
      mapping_generation: string | number,
      role_oid: string | number,
      role_name: string,
      rolsuper: boolean | null,
      rolcreaterole: boolean | null,
      rolcreatedb: boolean | null,
      rolcanlogin: boolean | null,
      rolreplication: boolean | null,
      rolbypassrls: boolean | null,
      base_role: boolean,
      can_set_role: boolean,
      login_authority_valid: boolean,
    }>(`
      SELECT i.id AS identity_id,
             i.display_name,
             i.identity_generation,
             m.allowed_role_id,
             m.mapping_generation,
             r.role_oid,
             r.role_name::text AS role_name,
             p.rolsuper,
             p.rolcreaterole,
             p.rolcreatedb,
             p.rolcanlogin,
             p.rolreplication,
             p.rolbypassrls,
             p.rolname = session_user AS base_role,
             pg_has_role(session_user, p.oid, 'SET') AS can_set_role,
             CASE
               WHEN i.provider <> 'postgresql' THEN true
               ELSE login_binding.database_oid = d.oid
                 AND live_login.oid = login_binding.role_oid
                 AND live_login.rolname = login_binding.role_name
                 AND live_login.rolsuper = false
                 AND live_login.rolcreaterole = false
                 AND live_login.rolcreatedb = false
                 AND live_login.rolcanlogin = true
                 AND live_login.rolreplication = false
                 AND live_login.rolbypassrls = false
                 AND pg_has_role(live_login.oid, p.oid, 'MEMBER')
             END AS login_authority_valid
        FROM tabular.identities i
        JOIN tabular.identity_role_mappings m
          ON m.identity_id = i.id AND m.connection_id = ? AND m.enabled
        JOIN tabular.allowed_roles r
          ON r.id = m.allowed_role_id AND r.connection_id = m.connection_id AND r.enabled
        LEFT JOIN pg_roles p
          ON p.oid = r.role_oid AND p.rolname = r.role_name
        LEFT JOIN tabular.postgresql_login_identities login_binding
          ON login_binding.identity_id = i.id
         AND login_binding.connection_id = m.connection_id
        LEFT JOIN pg_roles live_login
          ON live_login.oid = login_binding.role_oid
         AND live_login.rolname = login_binding.role_name
        JOIN pg_database d
          ON d.oid = r.database_oid AND d.datname = current_database()
       WHERE i.id = ? AND i.status = 'active'
       FOR UPDATE OF i, m, r
    `, [connectionId, identityId]);
    const row = result.rows[0];
    if (!row || row.rolsuper === null || !row.login_authority_valid) {
      throw new ApplicationError('identity_denied', 403, 'The identity has no current role mapping');
    }
    assertSafeRole(row as Parameters<typeof assertSafeRole>[0]);
    return row;
  }

  /**
   * Handle the latest active session operation.
   */
  public async latestActiveSession(identityId: string, connectionId: string) {
    const result = await this.database.execute<{ id: string, }>(`
      SELECT id
        FROM tabular.browser_sessions
       WHERE identity_id = ? AND connection_id = ? AND revoked_at IS NULL
       ORDER BY issued_at DESC, id DESC
       LIMIT 1
       FOR UPDATE
    `, [identityId, connectionId]);
    return result.rows[0]?.id;
  }

  /**
   * Revoke the identity sessions.
   */
  public async revokeIdentitySessions(identityId: string, connectionId: string, reason: string) {
    await this.database.execute(`
      UPDATE tabular.browser_sessions
         SET revoked_at = clock_timestamp(), revoke_reason = ?
       WHERE identity_id = ? AND connection_id = ? AND revoked_at IS NULL
    `, [reason, identityId, connectionId]);
  }

  /**
   * Insert the session.
   */
  public async insertSession(input: {
    id: string,
    historyScopeId: string,
    tokenHash: string,
    csrfTokenHash: string,
    identityId: string,
    identityGeneration: string | number,
    connectionId: string,
    allowedRoleId: string,
    roleOid: string | number,
    mappingGeneration: string | number,
    idleSeconds: number,
    absoluteSeconds: number,
    absoluteExpiresAt?: Date | string,
    rotatedFromId?: string,
  }) {
    const result = await this.database.execute<{
      issued_at: Date | string,
      idle_expires_at: Date | string,
      absolute_expires_at: Date | string,
    }>(`
      INSERT INTO tabular.browser_sessions (
        id, history_scope_id, token_hash, csrf_token_hash, identity_id, identity_generation,
        connection_id, allowed_role_id, role_oid, mapping_generation,
        idle_expires_at, absolute_expires_at, rotated_from_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        LEAST(
          clock_timestamp() + (? * interval '1 second'),
          COALESCE(CAST(? AS timestamptz), clock_timestamp() + (? * interval '1 second'))
        ),
        COALESCE(CAST(? AS timestamptz), clock_timestamp() + (? * interval '1 second')),
        ?
      )
      RETURNING issued_at, idle_expires_at, absolute_expires_at
    `, [
      input.id,
      input.historyScopeId,
      input.tokenHash,
      input.csrfTokenHash,
      input.identityId,
      input.identityGeneration,
      input.connectionId,
      input.allowedRoleId,
      input.roleOid,
      input.mappingGeneration,
      input.idleSeconds,
      input.absoluteExpiresAt || null,
      input.absoluteSeconds,
      input.absoluteExpiresAt || null,
      input.absoluteSeconds,
      input.rotatedFromId || null
    ]);
    if (input.rotatedFromId) {
      await this.database.execute(`
        UPDATE tabular.browser_sessions SET replaced_by_id = ? WHERE id = ?
      `, [input.id, input.rotatedFromId]);
    }
    if (!result.rows[0]) throw new Error('Browser session was not returned');
    return result.rows[0];
  }

  /**
   * Handle the session by token hash operation.
   */
  public async sessionByTokenHash(hash: string, lock: 'update' | 'share' = 'update') {
    const result = await this.database.execute<SessionAuthorityRow>(`
      SELECT s.id AS session_id,
             s.history_scope_id,
             s.identity_id,
             s.connection_id,
             i.display_name,
             s.token_hash,
             s.csrf_token_hash,
             s.idle_expires_at,
             s.absolute_expires_at,
             s.revoked_at,
             i.status AS identity_status,
             i.identity_generation,
             s.identity_generation AS session_identity_generation,
             m.mapping_generation,
             s.mapping_generation AS session_mapping_generation,
             m.enabled AS mapping_enabled,
             r.enabled AS role_enabled,
             r.role_generation,
             r.id AS allowed_role_id,
             r.role_oid AS configured_role_oid,
             p.oid AS live_role_oid,
             r.role_name::text AS configured_role_name,
             p.rolname::text AS live_role_name,
             p.rolsuper,
             p.rolcreaterole,
             p.rolcreatedb,
             p.rolcanlogin,
             p.rolreplication,
             p.rolbypassrls,
             d.oid = r.database_oid AS same_database,
             clock_timestamp() < s.idle_expires_at AS idle_valid,
             clock_timestamp() < s.absolute_expires_at AS absolute_valid,
             pg_has_role(session_user, p.oid, 'SET') AS can_set_role,
             CASE
               WHEN i.provider <> 'postgresql' THEN true
               ELSE login_binding.database_oid = d.oid
                 AND live_login.oid = login_binding.role_oid
                 AND live_login.rolname = login_binding.role_name
                 AND live_login.rolsuper = false
                 AND live_login.rolcreaterole = false
                 AND live_login.rolcreatedb = false
                 AND live_login.rolcanlogin = true
                 AND live_login.rolreplication = false
                 AND live_login.rolbypassrls = false
                 AND pg_has_role(live_login.oid, p.oid, 'MEMBER')
             END AS login_authority_valid
        FROM tabular.browser_sessions s
        JOIN tabular.identities i ON i.id = s.identity_id
        JOIN tabular.identity_role_mappings m
          ON m.identity_id = s.identity_id AND m.connection_id = s.connection_id
        JOIN tabular.allowed_roles r ON r.id = s.allowed_role_id
        LEFT JOIN pg_roles p ON p.oid = r.role_oid AND p.rolname = r.role_name
        LEFT JOIN tabular.postgresql_login_identities login_binding
          ON login_binding.identity_id = i.id
         AND login_binding.connection_id = s.connection_id
        LEFT JOIN pg_roles live_login
          ON live_login.oid = login_binding.role_oid
         AND live_login.rolname = login_binding.role_name
        JOIN pg_database d ON d.datname = current_database()
       WHERE s.token_hash = ?
       ${lock === 'share' ? 'FOR SHARE OF s' : 'FOR UPDATE OF s'}
    `, [hash]);
    return result.rows[0];
  }

  /**
   * Handle the session by id operation.
   */
  public async sessionById(sessionId: string) {
    const result = await this.database.execute<SessionAuthorityRow>(`
      SELECT s.id AS session_id,
             s.history_scope_id,
             s.identity_id,
             s.connection_id,
             i.display_name,
             s.token_hash,
             s.csrf_token_hash,
             s.idle_expires_at,
             s.absolute_expires_at,
             s.revoked_at,
             i.status AS identity_status,
             i.identity_generation,
             s.identity_generation AS session_identity_generation,
             m.mapping_generation,
             s.mapping_generation AS session_mapping_generation,
             m.enabled AS mapping_enabled,
             r.enabled AS role_enabled,
             r.role_generation,
             r.id AS allowed_role_id,
             r.role_oid AS configured_role_oid,
             p.oid AS live_role_oid,
             r.role_name::text AS configured_role_name,
             p.rolname::text AS live_role_name,
             p.rolsuper,
             p.rolcreaterole,
             p.rolcreatedb,
             p.rolcanlogin,
             p.rolreplication,
             p.rolbypassrls,
             d.oid = r.database_oid AS same_database,
             clock_timestamp() < s.idle_expires_at AS idle_valid,
             clock_timestamp() < s.absolute_expires_at AS absolute_valid,
             pg_has_role(session_user, p.oid, 'SET') AS can_set_role,
             CASE
               WHEN i.provider <> 'postgresql' THEN true
               ELSE login_binding.database_oid = d.oid
                 AND live_login.oid = login_binding.role_oid
                 AND live_login.rolname = login_binding.role_name
                 AND live_login.rolsuper = false
                 AND live_login.rolcreaterole = false
                 AND live_login.rolcreatedb = false
                 AND live_login.rolcanlogin = true
                 AND live_login.rolreplication = false
                 AND live_login.rolbypassrls = false
                 AND pg_has_role(live_login.oid, p.oid, 'MEMBER')
             END AS login_authority_valid
        FROM tabular.browser_sessions s
        JOIN tabular.identities i ON i.id = s.identity_id
        JOIN tabular.identity_role_mappings m
          ON m.identity_id = s.identity_id AND m.connection_id = s.connection_id
        JOIN tabular.allowed_roles r ON r.id = s.allowed_role_id
        LEFT JOIN pg_roles p ON p.oid = r.role_oid AND p.rolname = r.role_name
        LEFT JOIN tabular.postgresql_login_identities login_binding
          ON login_binding.identity_id = i.id
         AND login_binding.connection_id = s.connection_id
        LEFT JOIN pg_roles live_login
          ON live_login.oid = login_binding.role_oid
         AND live_login.rolname = login_binding.role_name
        JOIN pg_database d ON d.datname = current_database()
       WHERE s.id = ?
       FOR SHARE OF s
    `, [sessionId]);
    return result.rows[0];
  }

  /**
   * Handle the touch session operation.
   */
  public async touchSession(sessionId: string, idleSeconds: number) {
    const result = await this.database.execute<{
      idle_expires_at: Date | string,
      absolute_expires_at: Date | string,
    }>(`
      UPDATE tabular.browser_sessions
         SET last_seen_at = clock_timestamp(),
             idle_expires_at = LEAST(
               clock_timestamp() + (? * interval '1 second'),
               absolute_expires_at
             )
       WHERE id = ? AND revoked_at IS NULL
       RETURNING idle_expires_at, absolute_expires_at
    `, [idleSeconds, sessionId]);
    if (!result.rows[0]) {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
    return result.rows[0];
  }

  /**
   * Handle the issue CSRF token operation.
   */
  public async issueCsrfToken(
    sessionId: string,
    csrfTokenHash: string,
    absoluteExpiresAt: Date | string
  ) {
    await this.database.execute(`
      INSERT INTO tabular.browser_session_csrf_tokens (token_hash, session_id, expires_at)
      VALUES (?, ?, ?)
    `, [csrfTokenHash, sessionId, absoluteExpiresAt]);
    await this.database.execute(`
      DELETE FROM tabular.browser_session_csrf_tokens
       WHERE token_hash IN (
         SELECT token_hash
           FROM tabular.browser_session_csrf_tokens
          WHERE session_id = ?
          ORDER BY issued_at DESC, token_hash DESC
          OFFSET 8
       )
    `, [sessionId]);
  }

  /**
   * Handle the CSRF token hashes operation.
   */
  public async csrfTokenHashes(sessionId: string) {
    const result = await this.database.execute<{ token_hash: string, }>(`
      SELECT token_hash
        FROM tabular.browser_session_csrf_tokens
       WHERE session_id = ? AND clock_timestamp() < expires_at
       ORDER BY issued_at DESC, token_hash DESC
       LIMIT 8
    `, [sessionId]);
    return result.rows.map((row) => row.token_hash);
  }

  /**
   * Handle the session coordinates by token hash operation.
   */
  public async sessionCoordinatesByTokenHash(hash: string) {
    const result = await this.database.execute<{
      identity_id: string,
      connection_id: string,
    }>(`
      SELECT identity_id, connection_id
        FROM tabular.browser_sessions
       WHERE token_hash = ?
    `, [hash]);
    return result.rows[0];
  }

  /**
   * Handle the lock mapping operation.
   */
  public async lockMapping(
    identityId: string,
    connectionId: string,
    mode: 'share' | 'update' = 'share',
    required = true
  ) {
    const result = await this.database.execute<{ identity_id: string, }>(`
      SELECT identity_id
        FROM tabular.identity_role_mappings
       WHERE identity_id = ? AND connection_id = ?
       ${mode === 'share' ? 'FOR SHARE' : 'FOR UPDATE'}
    `, [identityId, connectionId]);
    if (required && !result.rows[0]) {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
    return Boolean(result.rows[0]);
  }

  /**
   * Handle the lock identity operation.
   */
  public async lockIdentity(identityId: string, mode: 'share' | 'update' = 'share') {
    const result = await this.database.execute<{ id: string, }>(`
      SELECT id FROM tabular.identities WHERE id = ?
      ${mode === 'share' ? 'FOR SHARE' : 'FOR UPDATE'}
    `, [identityId]);
    if (!result.rows[0]) {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
  }

  /**
   * Handle the lock allowed role for mapping operation.
   */
  public async lockAllowedRoleForMapping(identityId: string, connectionId: string) {
    const result = await this.database.execute<{ id: string, }>(`
      SELECT r.id
        FROM tabular.identity_role_mappings m
        JOIN tabular.allowed_roles r ON r.id = m.allowed_role_id
       WHERE m.identity_id = ? AND m.connection_id = ?
       FOR SHARE OF r
    `, [identityId, connectionId]);
    if (!result.rows[0]) {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
  }

  /**
   * Revoke the session.
   */
  public async revokeSession(sessionId: string, reason: string) {
    await this.database.execute(`
      UPDATE tabular.browser_sessions
         SET revoked_at = COALESCE(revoked_at, clock_timestamp()),
             revoke_reason = COALESCE(revoke_reason, ?)
       WHERE id = ?
    `, [reason, sessionId]);
  }

  /**
   * Set the identity status.
   */
  public async setIdentityStatus(identityId: string, status: 'active' | 'disabled' | 'revoked') {
    const result = await this.database.execute(`
      UPDATE tabular.identities
         SET status = ?,
             identity_generation = identity_generation + 1,
             updated_at = transaction_timestamp()
       WHERE id = ? AND status <> ?
    `, [status, identityId, status]);
    if (result.affectedRows) {
      await this.database.execute(`
        UPDATE tabular.browser_sessions
           SET revoked_at = clock_timestamp(), revoke_reason = ?
         WHERE identity_id = ? AND revoked_at IS NULL
      `, [`identity-${status}`, identityId]);
    }
  }
}

/**
 * Assert the usable session.
 */
export function assertUsableSession(row: SessionAuthorityRow | undefined) {
  if (
    !row
    || row.revoked_at
    || row.identity_status !== 'active'
    || String(row.identity_generation) !== String(row.session_identity_generation)
    || !row.mapping_enabled
    || String(row.mapping_generation) !== String(row.session_mapping_generation)
    || !row.role_enabled
    || String(row.configured_role_oid) !== String(row.live_role_oid)
    || row.configured_role_name !== row.live_role_name
    || !row.same_database
    || !row.idle_valid
    || !row.absolute_valid
    || !row.can_set_role
    || row.login_authority_valid === false
  ) {
    throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
  }
  try {
    assertSafeRole({
      rolsuper: row.rolsuper,
      rolcreaterole: row.rolcreaterole,
      rolcreatedb: row.rolcreatedb,
      rolcanlogin: row.rolcanlogin,
      rolreplication: row.rolreplication,
      rolbypassrls: row.rolbypassrls,
      base_role: false,
      can_set_role: row.can_set_role
    });
  } catch (error) {
    if (error instanceof ApplicationError && error.errorCode === 'role_not_allowed') {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
    throw error;
  }
  return row;
}

/**
 * Verify the effective role.
 */
export async function verifyEffectiveRole(
  database: DatabaseExecutor,
  expected: { oid: string | number, name: string, }
) {
  const result = await database.execute<{
    oid: string | number,
    role_name: string,
    rolsuper: boolean,
    rolcreaterole: boolean,
    rolcreatedb: boolean,
    rolcanlogin: boolean,
    rolreplication: boolean,
    rolbypassrls: boolean,
    base_role: boolean,
    can_set_role: boolean,
  }>(`
    SELECT r.oid,
           r.rolname::text AS role_name,
           r.rolsuper,
           r.rolcreaterole,
           r.rolcreatedb,
           r.rolcanlogin,
           r.rolreplication,
           r.rolbypassrls,
           r.rolname = session_user AS base_role,
           pg_has_role(session_user, r.oid, 'SET') AS can_set_role
      FROM pg_roles r
     WHERE r.rolname = current_user
  `);
  const role = result.rows[0];
  if (
    !role
    || String(role.oid) !== String(expected.oid)
    || role.role_name !== expected.name
  ) {
    throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
  }
  try {
    assertSafeRole(role);
  } catch (error) {
    if (error instanceof ApplicationError && error.errorCode === 'role_not_allowed') {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
    throw error;
  }
}

/**
 * Assert the safe role.
 */
function assertSafeRole(role: {
  rolsuper: boolean | null,
  rolcreaterole: boolean | null,
  rolcreatedb: boolean | null,
  rolcanlogin: boolean | null,
  rolreplication: boolean | null,
  rolbypassrls: boolean | null,
  base_role: boolean,
  can_set_role: boolean,
}) {
  if (
    role.rolsuper !== false
    || role.rolcreaterole !== false
    || role.rolcreatedb !== false
    || role.rolcanlogin !== false
    || role.rolreplication !== false
    || role.rolbypassrls !== false
    || role.base_role
    || !role.can_set_role
  ) {
    throw new ApplicationError('role_not_allowed', 403, 'The mapped role is not safely allowlisted');
  }
}
