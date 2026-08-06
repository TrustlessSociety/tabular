//node
import { createHash } from 'node:crypto';

//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { SessionAuthorityRow } from '../../identity/helpers/repository.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { OperationsPluginService } from '../../operations/helpers/service.js';
import type {
  AppliedFileDdl,
  ConfirmedFileDdl,
  FileDdlAction,
  PlannedFileDdl,
  NativeFileDdlEffect,
  StoredFileDdlRequest
} from '../helpers/contracts.js';
import type { NativeDdlFailpoint } from '../helpers/executor.js';
import { ApplicationError } from '../../../bootstrap/errors.js';
import {
  isBrowserMutationPrincipal
} from '../../identity/helpers/contracts.js';
import { IdentityRepository } from '../../identity/helpers/repository.js';
import {
  matchesTokenHash,
  opaqueToken,
  tokenHash
} from '../../identity/helpers/security.js';
import { reconcileCatalog } from '../../catalog/helpers/reconciliation.js';
import { executeNativeFileDdl } from '../helpers/executor.js';
import { finalizeFileDdl } from '../helpers/metadata.js';
import { authorizeFileDdlPlan, prepareFileDdlPlan } from '../helpers/planning.js';
import { FileRepository, iso } from '../helpers/repository.js';
import { validateFileDdlAction } from '../helpers/validation.js';

/**
 * Provide the file ddl workflow behavior used by this module.
 */
export class FileDdlWorkflow {
  /**
   * Create a FileDdlWorkflow instance.
   */
  public constructor(
    private readonly processKind: 'web' | 'migrator' | 'worker',
    private readonly database: DatabasePluginService,
    private readonly identity: IdentityPluginService,
    private readonly operations: OperationsPluginService
  ) {}

  /**
   * Handle the plan operation.
   */
  public plan(
    principal: BrowserMutationPrincipal,
    input: FileDdlAction
  ): Promise<PlannedFileDdl> {
    requireMutation(principal);
    const validated = validateFileDdlAction(input);
    const requestDigest = digest(validated);
    const requestId = `ddl_${opaqueToken()}`;
    const confirmationToken = opaqueToken();
    const expiresAt = new Date(Math.min(
      principal.absoluteExpiresAt.getTime(),
      Date.now() + 5 * 60_000
    ));
    let planned: Awaited<ReturnType<typeof prepareFileDdlPlan>> | undefined;
    let role: { roleOid: string, roleName: string, } | undefined;
    let replay: StoredFileDdlRequest | undefined;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.files',
      async (database) => {
        if (!planned) throw new Error('File DDL plan was not prepared');
        role = await authorizeFileDdlPlan(database, planned.action, planned.expected);
        planned.expected.requestingRoleOid = role.roleOid;
        planned.expected.requestingRoleName = role.roleName;
        return planned;
      },
      async (database) => {
        await database.execute(`
          SELECT pg_advisory_xact_lock(hashtextextended('tabular-file-command:' || ? || ':' || ? || ':' || ?, 0))
        `, [principal.identityId, principal.connectionId, validated.commandId]);
        const repository = new FileRepository(database);
        replay = await repository.requestReplay(principal, validated.commandId);
        if (replay && replay.request_digest !== requestDigest) idempotencyConflict();
        if (replay && (
          replay.session_id !== principal.sessionId
          || replay.history_scope_id !== principal.historyScopeId
        )) idempotencyConflict();
        const stable = await reconcileCatalog(database, principal.connectionId);
        planned = await prepareFileDdlPlan(
          database,
          stable,
          replay?.action_payload || validated
        );
        const generations = await currentAuthorityGenerations(database, principal);
        Object.assign(planned.expected, generations);
        if (replay) {
          planned.expected = structuredClone(replay.expected_context);
          planned.action = structuredClone(replay.action_payload);
        }
      },
      async (database, prepared) => {
        const repository = new FileRepository(database);
        if (replay) {
          if (replay.state !== 'planned') {
            throw new ApplicationError(
              'file_ddl_conflict',
              409,
              'This schema-change command is already confirmed or applied'
            );
          }
          await repository.rotatePlannedConfirmation(
            replay.id,
            tokenHash(confirmationToken),
            expiresAt
          );
          return plannedResult(
            replay.id,
            confirmationToken,
            replay.request_digest,
            expiresAt,
            prepared.action,
            prepared.summary
          );
        }
        if (!role) throw new Error('File DDL owner authorization did not run');
        await repository.insertPlan({
          id: requestId,
          principal,
          roleOid: role.roleOid,
          roleName: role.roleName,
          action: prepared.action,
          digest: requestDigest,
          expected: prepared.expected,
          confirmationHash: tokenHash(confirmationToken),
          expiresAt
        });
        return plannedResult(
          requestId,
          confirmationToken,
          requestDigest,
          expiresAt,
          prepared.action,
          prepared.summary
        );
      },
      'read committed'
    );
  }

  /**
   * Handle the confirm operation.
   */
  public confirm(
    principal: BrowserMutationPrincipal,
    requestId: string,
    confirmationToken: string
  ): Promise<ConfirmedFileDdl> {
    requireMutation(principal);
    let request: StoredFileDdlRequest | undefined;
    let confirmedReplay = false;
    return this.identity.authorizedTransaction(
      principal,
      'tabular.files',
      async (database) => {
        if (!request) throw new Error('File DDL confirmation was not loaded');
        if (!confirmedReplay) {
          await authorizeFileDdlPlan(database, request.action_payload, request.expected_context);
        }
        return request;
      },
      async (database) => {
        request = await new FileRepository(database).lockOwnedRequest(principal, requestId);
        if (!request || !['planned', 'confirmed'].includes(request.state)) confirmationDenied();
        if (!matchesTokenHash(confirmationToken, request.confirmation_hash)) confirmationDenied();
        if (request.state === 'confirmed') {
          confirmedReplay = true;
          return;
        }
        if (new Date(request.expires_at).getTime() <= Date.now()) confirmationDenied();
        await assertSameAuthorityGenerations(database, request);
      },
      async (database) => {
        if (confirmedReplay) {
          await this.operations.enqueueInTransaction(database, principal, {
            kind: 'ddl.apply',
            authority: 'migrator',
            idempotencyKey: `ddl.apply:${requestId}`,
            payload: { requestId },
            maxAttempts: 3
          });
          return { requestId, state: 'confirmed' as const, expiresAt: iso(request!.expires_at) };
        }
        const confirmed = await new FileRepository(database).confirm(requestId);
        if (!confirmed) confirmationDenied();
        await this.operations.enqueueInTransaction(database, principal, {
          kind: 'ddl.apply',
          authority: 'migrator',
          idempotencyKey: `ddl.apply:${requestId}`,
          payload: { requestId },
          maxAttempts: 3
        });
        return { requestId, state: 'confirmed', expiresAt: iso(confirmed.expires_at) };
      },
      'read committed'
    );
  }

  /**
   * Apply the current value.
   */
  public apply(
    requestId: string,
    options: { failpoint?: NativeDdlFailpoint, } = {}
  ): Promise<AppliedFileDdl> {
    if (this.processKind !== 'migrator') {
      throw new ApplicationError(
        'file_ddl_denied',
        403,
        'Only the separate migrator process can apply confirmed schema changes'
      );
    }
    return this.applyMigrator(requestId, options);
  }

  /**
   * Apply the migrator.
   */
  private async applyMigrator(
    requestId: string,
    options: { failpoint?: NativeDdlFailpoint, }
  ) {
    const existing = await this.database.transaction('migrator', {}, (database) =>
      new FileRepository(database).requestById(requestId)
    );
    if (!existing) confirmationDenied();
    if (existing.state === 'applied' && existing.result_summary) return existing.result_summary;
    let request: StoredFileDdlRequest | undefined;
    try {
      return await this.database.transaction<NativeFileDdlEffect, AppliedFileDdl>('migrator', {
      resolveRole: async (database) => {
        const repository = new FileRepository(database);
        const coordinates = await repository.requestById(requestId);
        if (!coordinates) confirmationDenied();
        const identityRepository = new IdentityRepository(database);
        await identityRepository.lockIdentity(coordinates.actor_identity_id);
        await identityRepository.lockMapping(
          coordinates.actor_identity_id,
          coordinates.connection_id
        );
        await identityRepository.lockAllowedRoleForMapping(
          coordinates.actor_identity_id,
          coordinates.connection_id
        );
        const session = await identityRepository.sessionById(coordinates.session_id);
        request = await repository.lockConfirmedRequest(requestId);
        if (!request) confirmationDenied();
        if (request.state === 'applied') {
          if (!request.result_summary) confirmationDenied();
          throw new AppliedReplay(request.result_summary);
        }
        assertLockedAuthority(session, request);
        await assertMigratorAuthority(database, request, false);
        return {
          role: request.expected_context.ownerRoleName!,
          verifyAfterSet: async (effectiveDatabase: DatabaseExecutor) => {
            const effective = await effectiveDatabase.execute<{ oid: string, name: string, }>(`
              SELECT current_user::regrole::oid::text AS oid, current_user::text AS name
            `);
            if (effective.rows[0]?.oid !== request!.expected_context.ownerRoleOid
              || effective.rows[0]?.name !== request!.expected_context.ownerRoleName) {
              throw new Error('Migrator effective owner role did not match the confirmed target');
            }
          }
        };
      },
      finalizeBase: async (database, effect) => {
        await assertMigratorAuthority(database, request!, false);
        const result = await finalizeFileDdl(database, request!, effect);
        await new FileRepository(database).markApplied(request!, result);
        return result;
      }
    }, async (database) => {
      return executeNativeFileDdl(database, request!, options);
    });
    } catch (error) {
      if (error instanceof AppliedReplay) return error.result;
      throw error;
    }
  }
}

/**
 * Return the current authority generations result.
 */
async function currentAuthorityGenerations(
  database: DatabaseExecutor,
  principal: BrowserPrincipal
) {
  const result = await database.execute<{
    identity_generation: string | number,
    mapping_generation: string | number,
    allowed_role_id: string,
    role_generation: string | number,
  }>(`
    SELECT i.identity_generation, m.mapping_generation,
           r.id AS allowed_role_id, r.role_generation
      FROM tabular.identities i
      JOIN tabular.identity_role_mappings m
        ON m.identity_id = i.id AND m.connection_id = ?
      JOIN tabular.allowed_roles r ON r.id = m.allowed_role_id
      JOIN tabular.browser_sessions s
        ON s.id = ? AND s.identity_id = i.id AND s.connection_id = m.connection_id
     WHERE i.id = ?
  `, [principal.connectionId, principal.sessionId, principal.identityId]);
  const row = result.rows[0];
  if (!row) confirmationDenied();
  return {
    identityGeneration: Number(row.identity_generation),
    mappingGeneration: Number(row.mapping_generation),
    allowedRoleId: row.allowed_role_id,
    roleGeneration: Number(row.role_generation)
  };
}

/**
 * Assert the same authority generations.
 */
async function assertSameAuthorityGenerations(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest
) {
  const result = await database.execute<{ valid: boolean, }>(`
    SELECT i.status = 'active'
       AND i.identity_generation = ?
       AND m.enabled AND m.mapping_generation = ?
       AND r.enabled AND r.id = ? AND r.role_generation = ?
       AND r.role_oid = ?::oid AND r.role_name = ?
       AND s.revoked_at IS NULL AND clock_timestamp() < s.absolute_expires_at
       AND s.identity_generation = i.identity_generation
       AND s.mapping_generation = m.mapping_generation AS valid
      FROM tabular.identities i
      JOIN tabular.identity_role_mappings m
        ON m.identity_id = i.id AND m.connection_id = ?
      JOIN tabular.allowed_roles r ON r.id = m.allowed_role_id
      JOIN tabular.browser_sessions s
        ON s.id = ? AND s.identity_id = i.id AND s.connection_id = m.connection_id
     WHERE i.id = ?
  `, [
    request.identity_generation,
    request.mapping_generation,
    request.allowed_role_id,
    request.role_generation,
    request.requesting_role_oid,
    request.requesting_role_name,
    request.connection_id,
    request.session_id,
    request.actor_identity_id
  ]);
  if (!result.rows[0]?.valid) confirmationDenied();
}

/**
 * Assert the migrator authority.
 */
async function assertMigratorAuthority(
  database: DatabaseExecutor,
  request: StoredFileDdlRequest,
  checkAuthorityRows = true
) {
  if (checkAuthorityRows) await assertSameAuthorityGenerations(database, request);
  const owner = request.expected_context;
  const result = await database.execute<{
    database_oid: string | number,
    owner_oid: string | number,
    owner_name: string,
    caller_usable: boolean,
    migrator_can_set: boolean,
    rolcanlogin: boolean,
    rolsuper: boolean,
    rolcreaterole: boolean,
    rolcreatedb: boolean,
    rolreplication: boolean,
    rolbypassrls: boolean,
    caller_oid: string | number,
    caller_name: string,
    caller_rolcanlogin: boolean,
    caller_rolsuper: boolean,
    caller_rolcreaterole: boolean,
    caller_rolcreatedb: boolean,
    caller_rolreplication: boolean,
    caller_rolbypassrls: boolean,
  }>(`
    SELECT d.oid AS database_oid, owner.oid AS owner_oid,
           owner.rolname::text AS owner_name,
           pg_has_role(?::oid, owner.oid, 'USAGE') AS caller_usable,
           pg_has_role(session_user, owner.oid, 'SET') AS migrator_can_set,
           owner.rolcanlogin, owner.rolsuper, owner.rolcreaterole,
           owner.rolcreatedb, owner.rolreplication, owner.rolbypassrls,
           caller.oid AS caller_oid, caller.rolname::text AS caller_name,
           caller.rolcanlogin AS caller_rolcanlogin,
           caller.rolsuper AS caller_rolsuper,
           caller.rolcreaterole AS caller_rolcreaterole,
           caller.rolcreatedb AS caller_rolcreatedb,
           caller.rolreplication AS caller_rolreplication,
           caller.rolbypassrls AS caller_rolbypassrls
      FROM pg_database d
      JOIN pg_roles owner ON owner.oid = ?::oid AND owner.rolname = ?
      JOIN pg_roles caller ON caller.oid = ?::oid AND caller.rolname = ?
     WHERE d.datname = current_database()
  `, [
    request.requesting_role_oid,
    owner.ownerRoleOid!,
    owner.ownerRoleName!,
    request.requesting_role_oid,
    request.requesting_role_name
  ]);
  const row = result.rows[0];
  if (!row
    || String(row.database_oid) !== String(request.database_oid)
    || String(row.owner_oid) !== owner.ownerRoleOid
    || row.owner_name !== owner.ownerRoleName
    || !row.caller_usable
    || !row.migrator_can_set
    || row.rolcanlogin
    || row.rolsuper
    || row.rolcreaterole
    || row.rolcreatedb
    || row.rolreplication
    || row.rolbypassrls
    || String(row.caller_oid) !== String(request.requesting_role_oid)
    || row.caller_name !== request.requesting_role_name
    || row.caller_rolcanlogin
    || row.caller_rolsuper
    || row.caller_rolcreaterole
    || row.caller_rolcreatedb
    || row.caller_rolreplication
    || row.caller_rolbypassrls) confirmationDenied();
}

/**
 * Assert the locked authority.
 */
function assertLockedAuthority(
  row: SessionAuthorityRow | undefined,
  request: StoredFileDdlRequest
) {
  if (!row
    || row.session_id !== request.session_id
    || row.history_scope_id !== request.history_scope_id
    || row.identity_id !== request.actor_identity_id
    || row.connection_id !== request.connection_id
    || row.identity_status !== 'active'
    || Number(row.identity_generation) !== Number(request.identity_generation)
    || Number(row.session_identity_generation) !== Number(request.identity_generation)
    || Number(row.mapping_generation) !== Number(request.mapping_generation)
    || Number(row.session_mapping_generation) !== Number(request.mapping_generation)
    || row.allowed_role_id !== request.allowed_role_id
    || Number(row.role_generation) !== Number(request.role_generation)
    || !row.mapping_enabled
    || !row.role_enabled
    || String(row.configured_role_oid) !== String(request.requesting_role_oid)
    || String(row.live_role_oid) !== String(request.requesting_role_oid)
    || row.configured_role_name !== request.requesting_role_name
    || row.live_role_name !== request.requesting_role_name
    || !row.same_database
    || !row.idle_valid
    || !row.absolute_valid
    || row.revoked_at !== null
    || row.rolsuper !== false
    || row.rolcreaterole !== false
    || row.rolcreatedb !== false
    || row.rolcanlogin !== false
    || row.rolreplication !== false
    || row.rolbypassrls !== false
    || new Date(request.expires_at).getTime() <= Date.now()) confirmationDenied();
}

class AppliedReplay extends Error {
  /**
   * Create a AppliedReplay instance.
   */
  public constructor(public readonly result: AppliedFileDdl) {
    super('Applied file DDL replay');
  }
}

/**
 * Return the planned result result.
 */
function plannedResult(
  requestId: string,
  confirmationToken: string,
  requestDigest: string,
  expiresAt: Date,
  action: FileDdlAction,
  summary: Record<string, unknown>
): PlannedFileDdl {
  return {
    requestId,
    confirmationToken,
    actionType: action.type,
    requestDigest,
    expiresAt: expiresAt.toISOString(),
    summary
  };
}

/**
 * Return the digest result.
 */
function digest(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

/**
 * Return the stable JSON result.
 */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item !== 'undefined')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Return the require mutation result.
 */
function requireMutation(
  principal: BrowserPrincipal | BrowserMutationPrincipal
): asserts principal is BrowserMutationPrincipal {
  if (!isBrowserMutationPrincipal(principal)) {
    throw new ApplicationError('capability_denied', 403, 'A verified browser mutation is required');
  }
}

/**
 * Return the confirmation denied result.
 */
function confirmationDenied(): never {
  throw new ApplicationError('file_ddl_confirmation_denied', 403, 'The schema-change confirmation is invalid');
}
/**
 * Return the idempotency conflict result.
 */
function idempotencyConflict(): never {
  throw new ApplicationError('file_ddl_idempotency_conflict', 409, 'The command identity is already bound to another schema change');
}
