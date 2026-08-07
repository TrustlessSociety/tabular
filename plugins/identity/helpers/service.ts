//node
import { createHash } from 'node:crypto';

//modules
import type { Response } from '@stackpress/ingest/http';

//client
import type { TabularConfig } from '../../../config/index.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import type { PostgreSqlLoginCredentials, VerifiedPostgreSqlSubject } from './postgresql-login.js';
import type {
  AuthorizedCallback,
  AuthorizedFinalizeCallback,
  BrowserPrincipal,
  BrowserMutationPrincipal,
  EstablishedBrowserSession,
  IdentityCapability,
  VerifiedProviderSubject
} from './contracts.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import { DATABASE_SERVICE } from '../../database/helpers/service.js';
import { assertVerifiedProviderSubject, issueBrowserMutationPrincipal } from './contracts.js';
import { requireCapability } from './policy.js';
import { PostgreSqlIdentityProvider } from './postgresql-login.js';
import {
  IdentityRepository,
  assertUsableSession,
  verifyEffectiveRole
} from './repository.js';
import {
  expiredSessionCookieOptions,
  matchesTokenHash,
  opaqueId,
  opaqueToken,
  requireExactOrigin,
  sessionCookieOptions,
  tokenHash
} from './security.js';

//The identity service value exported for module callers
export const IDENTITY_SERVICE = 'tabular.identity';

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_SECONDS = 300;
const LOGIN_BLOCK_SECONDS = 900;

type SessionResponse = Pick<Response, 'session' | 'headers'>;

//The development login contract is injected only by the source PGlite entrypoint.
export type DevelopmentLoginProvider = (
  input: PostgreSqlLoginCredentials
) => Promise<VerifiedPostgreSqlSubject>;

/**
 * Provide identity plugin operations through one service boundary.
 */
export class IdentityPluginService {
  //The name state retained by this class instance
  public readonly name = IDENTITY_SERVICE;

  /**
   * Create a IdentityPluginService instance.
   */
  public constructor(
    private readonly database: DatabasePluginService,
    private readonly config: TabularConfig,
    private readonly developmentLogin?: DevelopmentLoginProvider
  ) {
    if (developmentLogin && this.config.environment.mode !== 'development') {
      throw new Error('The development login verifier is unavailable outside development');
    }
  }

  /**
   * Handle the provision identity role operation.
   */
  public async provisionIdentityRole(
    subject: VerifiedProviderSubject,
    roleName: string
  ) {
    assertVerifiedProviderSubject(subject);
    return this.database.transaction('web', {}, async (database) => {
      const repository = new IdentityRepository(database);
      const identity = await repository.provisionIdentity(subject);
      await repository.lockMapping(
        identity.id,
        this.config.database.connectionId,
        'update',
        false
      );
      const allowedRoleId = await repository.allowRole(
        this.config.database.connectionId,
        roleName
      );
      await repository.mapIdentity(
        identity.id,
        this.config.database.connectionId,
        allowedRoleId
      );
      return { identityId: identity.id, allowedRoleId };
    });
  }

  /**
   * Handle the remap identity role operation.
   */
  public async remapIdentityRole(identityId: string, roleName: string) {
    return this.database.transaction('web', {}, async (database) => {
      const repository = new IdentityRepository(database);
      await repository.lockIdentity(identityId, 'update');
      await repository.lockMapping(identityId, this.config.database.connectionId, 'update');
      const allowedRoleId = await repository.allowRole(
        this.config.database.connectionId,
        roleName
      );
      await repository.mapIdentity(identityId, this.config.database.connectionId, allowedRoleId);
      return { identityId, allowedRoleId };
    });
  }

  /**
   * Set the identity status.
   */
  public async setIdentityStatus(identityId: string, status: 'active' | 'disabled' | 'revoked') {
    return this.database.transaction('web', {}, async (database) => {
      const repository = new IdentityRepository(database);
      await repository.lockIdentity(identityId, 'update');
      return repository.setIdentityStatus(identityId, status);
    });
  }

  /**
   * Handle the establish browser session operation.
   */
  public async establishBrowserSession(
    subject: VerifiedProviderSubject,
    response?: SessionResponse
  ): Promise<EstablishedBrowserSession> {
    assertVerifiedProviderSubject(subject);
    const cookieToken = opaqueToken();
    const csrfToken = opaqueToken();
    const sessionId = opaqueId('sess');
    const historyScopeId = opaqueId('hist');
    const established = await this.database.transaction('web', {}, async (database) => {
      const repository = new IdentityRepository(database);
      const identity = await repository.provisionIdentity(subject);
      const mapping = await repository.resolveLogin(
        identity.id,
        this.config.database.connectionId
      );
      const times = await repository.insertSession({
        id: sessionId,
        historyScopeId,
        tokenHash: tokenHash(cookieToken),
        csrfTokenHash: tokenHash(csrfToken),
        identityId: identity.id,
        identityGeneration: mapping.identity_generation,
        connectionId: this.config.database.connectionId,
        allowedRoleId: mapping.allowed_role_id,
        roleOid: mapping.role_oid,
        mappingGeneration: mapping.mapping_generation,
        idleSeconds: this.config.sessions.idleTimeoutSeconds,
        absoluteSeconds: this.config.sessions.maxAgeSeconds
      });
      return {
        principal: principalFrom({
          session_id: sessionId,
          history_scope_id: historyScopeId,
          identity_id: identity.id,
          connection_id: this.config.database.connectionId,
          display_name: identity.display_name,
          idle_expires_at: times.idle_expires_at,
          absolute_expires_at: times.absolute_expires_at
        }),
        cookieToken,
        csrfToken
      };
    });
    if (response) this.writeSessionCookie(response, cookieToken);
    return established;
  }

  /**
   * Handle the login with postgre SQL credentials operation.
   */
  public async loginWithPostgreSqlCredentials(input: {
    roleName: string,
    password: string,
    origin: string | string[] | undefined,
  }, response?: SessionResponse): Promise<EstablishedBrowserSession> {
    requireExactOrigin(input.origin, this.config.environment.publicOrigin);
    const attemptKeyHash = createHash('sha256')
      .update(this.config.database.connectionId, 'utf8')
      .update('\u0000', 'utf8')
      .update(input.roleName, 'utf8')
      .digest('hex');

    try {
      const allowed = await this.database.transaction('web', {}, (database) =>
        new IdentityRepository(database).reservePostgreSqlLoginAttempt({
          attemptKeyHash,
          maximumAttempts: LOGIN_ATTEMPT_LIMIT,
          windowSeconds: LOGIN_ATTEMPT_WINDOW_SECONDS,
          blockSeconds: LOGIN_BLOCK_SECONDS
        })
      );

      const provider = this.developmentLogin
        ? { verify: this.developmentLogin }
        : this.config.database.webUrl
          ? new PostgreSqlIdentityProvider(
            this.config.database.connectionId,
            this.config.database.webUrl,
            this.config.database.statementTimeoutMs
          )
          : undefined;
      if (!allowed || !provider) throw new Error('Sign-in denied');
      const subject = await provider.verify({
        roleName: input.roleName,
        password: input.password
      });
      const cookieToken = opaqueToken();
      const csrfToken = opaqueToken();
      const sessionId = opaqueId('sess');
      const historyScopeId = opaqueId('hist');
      const established = await this.database.transaction('web', {}, async (database) => {
        const repository = new IdentityRepository(database);
        const identity = await repository.provisionIdentity(subject);
        await repository.bindPostgreSqlIdentity(
          identity.id,
          this.config.database.connectionId,
          subject
        );
        await repository.lockMapping(
          identity.id,
          this.config.database.connectionId,
          'update',
          false
        );
        const authorizationRole = await repository.resolvePostgreSqlAuthorizationRole(subject);
        const allowedRoleId = await repository.allowRole(
          this.config.database.connectionId,
          authorizationRole.role_name
        );
        await repository.mapIdentity(
          identity.id,
          this.config.database.connectionId,
          allowedRoleId
        );
        const mapping = await repository.resolveLogin(
          identity.id,
          this.config.database.connectionId
        );
        const times = await repository.insertSession({
          id: sessionId,
          historyScopeId,
          tokenHash: tokenHash(cookieToken),
          csrfTokenHash: tokenHash(csrfToken),
          identityId: identity.id,
          identityGeneration: mapping.identity_generation,
          connectionId: this.config.database.connectionId,
          allowedRoleId: mapping.allowed_role_id,
          roleOid: mapping.role_oid,
          mappingGeneration: mapping.mapping_generation,
          idleSeconds: this.config.sessions.idleTimeoutSeconds,
          absoluteSeconds: this.config.sessions.maxAgeSeconds
        });
        await repository.clearPostgreSqlLoginAttempts(attemptKeyHash);
        return {
          principal: principalFrom({
            session_id: sessionId,
            history_scope_id: historyScopeId,
            identity_id: identity.id,
            connection_id: this.config.database.connectionId,
            display_name: identity.display_name,
            idle_expires_at: times.idle_expires_at,
            absolute_expires_at: times.absolute_expires_at
          }),
          cookieToken,
          csrfToken
        };
      });
      if (response) this.writeSessionCookie(response, cookieToken);
      return established;
    } catch {
      throw new ApplicationError(
        'authentication_failed',
        401,
        'Sign-in failed. Check your PostgreSQL role and password.'
      );
    }
  }

  /**
   * Handle the require login origin operation.
   */
  public requireLoginOrigin(origin: string | string[] | undefined) {
    requireExactOrigin(origin, this.config.environment.publicOrigin);
  }

  /**
   * Authenticate the browser session.
   */
  public async authenticateBrowserSession(cookieToken: string | string[] | undefined) {
    if (typeof cookieToken !== 'string') return undefined;
    let hash: string;
    try {
      hash = tokenHash(cookieToken);
    } catch {
      return undefined;
    }
    try {
      return await this.database.transaction('web', {}, async (database) => {
        const repository = new IdentityRepository(database);
        const row = assertUsableSession(await lockedSessionByTokenHash(repository, hash));
        const times = await repository.touchSession(
          row.session_id,
          this.config.sessions.idleTimeoutSeconds
        );
        return principalFrom({ ...row, ...times });
      });
    } catch (error) {
      if (error instanceof ApplicationError && error.errorCode === 'invalid_session') {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Handle the resume browser session operation.
   */
  public async resumeBrowserSession(cookieToken: string | string[] | undefined) {
    if (typeof cookieToken !== 'string') return undefined;
    let hash: string;
    try {
      hash = tokenHash(cookieToken);
    } catch {
      return undefined;
    }
    const csrfToken = opaqueToken();
    try {
      return await this.database.transaction('web', {}, async (database) => {
        const repository = new IdentityRepository(database);
        const row = assertUsableSession(await lockedSessionByTokenHash(repository, hash));
        await repository.issueCsrfToken(
          row.session_id,
          tokenHash(csrfToken),
          row.absolute_expires_at
        );
        const times = await repository.touchSession(
          row.session_id,
          this.config.sessions.idleTimeoutSeconds
        );
        return { principal: principalFrom({ ...row, ...times }), csrfToken };
      });
    } catch (error) {
      if (error instanceof ApplicationError && error.errorCode === 'invalid_session') {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Handle the require browser mutation operation.
   */
  public async requireBrowserMutation(input: {
    cookieToken: string | string[] | undefined,
    csrfToken: string | string[] | undefined,
    origin: string | string[] | undefined,
  }): Promise<BrowserMutationPrincipal> {
    requireExactOrigin(input.origin, this.config.environment.publicOrigin);
    if (typeof input.cookieToken !== 'string' || typeof input.csrfToken !== 'string') {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
    const hash = tokenHash(input.cookieToken);
    return this.database.transaction('web', {}, async (database) => {
      const repository = new IdentityRepository(database);
      const row = assertUsableSession(await lockedSessionByTokenHash(repository, hash));
      if (!await matchesSessionCsrf(repository, row, input.csrfToken as string)) {
        throw new ApplicationError('invalid_csrf', 403, 'The request token is invalid');
      }
      await repository.touchSession(row.session_id, this.config.sessions.idleTimeoutSeconds);
      return issueBrowserMutationPrincipal(principalFrom(row));
    });
  }

  /**
   * Handle the rotate browser session operation.
   */
  public async rotateBrowserSession(input: {
    cookieToken: string | string[] | undefined,
    csrfToken: string | string[] | undefined,
    origin: string | string[] | undefined,
  }, response?: SessionResponse) {
    requireExactOrigin(input.origin, this.config.environment.publicOrigin);
    if (typeof input.cookieToken !== 'string' || typeof input.csrfToken !== 'string') {
      throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
    }
    const newCookieToken = opaqueToken();
    const newCsrfToken = opaqueToken();
    const newSessionId = opaqueId('sess');
    const rotated = await this.database.transaction('web', {}, async (database) => {
      const repository = new IdentityRepository(database);
      const row = assertUsableSession(
        await lockedSessionByTokenHash(repository, tokenHash(input.cookieToken as string))
      );
      if (!await matchesSessionCsrf(repository, row, input.csrfToken as string)) {
        throw new ApplicationError('invalid_csrf', 403, 'The request token is invalid');
      }
      await repository.revokeSession(row.session_id, 'session-rotated');
      const times = await repository.insertSession({
        id: newSessionId,
        historyScopeId: row.history_scope_id,
        tokenHash: tokenHash(newCookieToken),
        csrfTokenHash: tokenHash(newCsrfToken),
        identityId: row.identity_id,
        identityGeneration: row.identity_generation,
        connectionId: row.connection_id,
        allowedRoleId: row.allowed_role_id,
        roleOid: row.configured_role_oid,
        mappingGeneration: row.mapping_generation,
        idleSeconds: this.config.sessions.idleTimeoutSeconds,
        absoluteSeconds: this.config.sessions.maxAgeSeconds,
        absoluteExpiresAt: row.absolute_expires_at,
        rotatedFromId: row.session_id
      });
      return {
        principal: principalFrom({
          session_id: newSessionId,
          history_scope_id: row.history_scope_id,
          identity_id: row.identity_id,
          connection_id: row.connection_id,
          display_name: row.display_name,
          idle_expires_at: times.idle_expires_at,
          absolute_expires_at: times.absolute_expires_at
        }),
        cookieToken: newCookieToken,
        csrfToken: newCsrfToken
      };
    });
    if (response) this.writeSessionCookie(response, newCookieToken);
    return rotated;
  }

  /**
   * Handle the logout browser session operation.
   */
  public async logoutBrowserSession(input: {
    cookieToken: string | string[] | undefined,
    csrfToken: string | string[] | undefined,
    origin: string | string[] | undefined,
  }) {
    requireExactOrigin(input.origin, this.config.environment.publicOrigin);
    if (typeof input.cookieToken !== 'string') return false;
    let hash: string;
    try {
      hash = tokenHash(input.cookieToken);
    } catch {
      return false;
    }
    return this.database.transaction('web', {}, async (database) => {
      const repository = new IdentityRepository(database);
      const row = await lockedSessionByTokenHash(repository, hash);
      if (!row) return false;
      try {
        assertUsableSession(row);
      } catch (error) {
        if (error instanceof ApplicationError && error.errorCode === 'invalid_session') return false;
        throw error;
      }
      if (
        typeof input.csrfToken !== 'string'
        || !await matchesSessionCsrf(repository, row, input.csrfToken)
      ) {
        throw new ApplicationError('invalid_csrf', 403, 'The request token is invalid');
      }
      await repository.revokeSession(row.session_id, 'logout');
      return true;
    });
  }

  /**
   * Report the authorized transaction condition.
   */
  public authorizedTransaction<Result, FinalResult = Result>(
    principal: BrowserPrincipal,
    capability: IdentityCapability | string,
    callback: AuthorizedCallback<Result>,
    prepareBase?: (database: DatabaseExecutor) => Promise<void>,
    finalizeBase?: AuthorizedFinalizeCallback<Result, FinalResult>,
    isolation?: 'read committed' | 'repeatable read'
  ) {
    requireCapability(principal, capability);
    return this.database.transaction<Result, FinalResult>('web', {
      ...(
        isolation === 'repeatable read' || (!isolation && prepareBase)
          ? { isolation: 'repeatable read' as const }
          : {}
      ),
      resolveRole: async (database) => {
        const repository = new IdentityRepository(database);
        await repository.lockIdentity(principal.identityId);
        await repository.lockMapping(principal.identityId, principal.connectionId);
        await repository.lockAllowedRoleForMapping(
          principal.identityId,
          principal.connectionId
        );
        const row = assertUsableSession(await repository.sessionById(principal.sessionId));
        if (
          row.identity_id !== principal.identityId
          || row.connection_id !== principal.connectionId
          || row.history_scope_id !== principal.historyScopeId
          || new Date(row.absolute_expires_at).getTime() !== principal.absoluteExpiresAt.getTime()
        ) {
          throw new ApplicationError('invalid_session', 401, 'The browser session is invalid');
        }
        if (prepareBase) await prepareBase(database);
        return {
          role: row.configured_role_name,
          verifyAfterSet: (effectiveDatabase: DatabaseExecutor) => verifyEffectiveRole(
            effectiveDatabase,
            { oid: row.configured_role_oid, name: row.configured_role_name }
          )
        };
      },
      ...(finalizeBase ? {
        finalizeBase: (database: DatabaseExecutor, result: Result) =>
          finalizeBase(database, result, principal)
      } : {})
    }, (database) => callback(database, principal));
  }

  /**
   * Handle the session cookie operation.
   */
  public sessionCookie(response: SessionResponse) {
    return response.session;
  }

  /**
   * Write the session cookie.
   */
  public writeSessionCookie(response: SessionResponse, cookieToken: string) {
    response.session.set(
      this.config.sessions.cookieName,
      cookieToken,
      sessionCookieOptions(this.config.sessions)
    );
    response.headers.set('Cache-Control', 'no-store, private');
  }

  /**
   * Clear the session cookie.
   */
  public clearSessionCookie(response: SessionResponse) {
    response.session.set(
      this.config.sessions.cookieName,
      '',
      expiredSessionCookieOptions(this.config.sessions)
    );
    response.headers.set('Cache-Control', 'no-store, private');
  }

  /**
   * Handle the cookie name operation.
   */
  public cookieName() {
    return this.config.sessions.cookieName;
  }
}

/**
 * Return the locked session by token hash result.
 */
async function lockedSessionByTokenHash(repository: IdentityRepository, hash: string) {
  const coordinates = await repository.sessionCoordinatesByTokenHash(hash);
  if (!coordinates) return undefined;
  await repository.lockIdentity(coordinates.identity_id);
  await repository.lockMapping(coordinates.identity_id, coordinates.connection_id);
  await repository.lockAllowedRoleForMapping(
    coordinates.identity_id,
    coordinates.connection_id
  );
  return repository.sessionByTokenHash(hash);
}

/**
 * Report the matches session CSRF condition.
 */
async function matchesSessionCsrf(
  repository: IdentityRepository,
  row: { session_id: string, csrf_token_hash: string, },
  token: string
) {
  if (matchesTokenHash(token, row.csrf_token_hash)) return true;
  const hashes = await repository.csrfTokenHashes(row.session_id);
  return hashes.some((hash) => matchesTokenHash(token, hash));
}

/**
 * Return the principal from result.
 */
function principalFrom(row: {
  session_id: string,
  history_scope_id: string,
  identity_id: string,
  connection_id: string,
  display_name: string | null,
  idle_expires_at: Date | string,
  absolute_expires_at: Date | string,
}): BrowserPrincipal {
  return {
    transport: 'browser',
    sessionId: row.session_id,
    historyScopeId: row.history_scope_id,
    identityId: row.identity_id,
    connectionId: row.connection_id,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    idleExpiresAt: new Date(row.idle_expires_at),
    absoluteExpiresAt: new Date(row.absolute_expires_at)
  };
}

/**
 * Return the require identity service result.
 */
export function requireIdentityService(value: unknown): asserts value is IdentityPluginService {
  if (!(value instanceof IdentityPluginService)) {
    throw new Error(`${DATABASE_SERVICE} and ${IDENTITY_SERVICE} must be registered in order`);
  }
}
