//client
import type {
  AuthorityPhases,
  CapabilityAction
} from '../../capability/helpers/contracts.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import type {
  McpCapabilityToolName,
  McpTransportRequest,
  VerifiedMcpPrincipal
} from './contracts.js';
import { PostgreSqlTransactionCancelledError } from '../../database/helpers/transactions.js';
import {
  IdentityRepository,
  verifyEffectiveRole
} from '../../identity/helpers/repository.js';
import { GovernedMcpExecutionContext, MCP_CAPABILITY_ACTIONS } from './contracts.js';

const actionTools = new Map<CapabilityAction['type'], McpCapabilityToolName>(
  Object.entries(MCP_CAPABILITY_ACTIONS).map(([tool, action]) => [
    action,
    tool as McpCapabilityToolName
  ])
);

//The mcp execution boundary contract exported for module callers
export type McpExecutionBoundary = {
  signal: AbortSignal,
  timeoutMs: number,
  deadlineExceeded(): boolean,
};

/**
 * Provide the web pool governed mcp authority behavior used by this module.
 */
export class WebPoolGovernedMcpAuthority extends GovernedMcpExecutionContext {
  //The transaction cancelled state retained by this class instance
  #transactionCancelled = false;
  //The transaction deadline exceeded state retained by this class instance
  #transactionDeadlineExceeded = false;

  /**
   * Create a WebPoolGovernedMcpAuthority instance.
   */
  public constructor(
    private readonly database: DatabasePluginService,
    private readonly principal: VerifiedMcpPrincipal,
    private readonly execution: McpExecutionBoundary
  ) {
    super({
      actorIdentityId: principal.identityId,
      sessionId: principal.sessionId,
      historyScopeId: principal.historyScopeId,
      connectionId: principal.connectionId,
      expiresAt: principal.expiresAt
    });
  }

  /**
   * Report the allows MCP condition.
   */
  public allowsMcp(request: McpTransportRequest) {
    if (request.kind === 'tool') return this.principal.scopes.tools.includes(request.name);
    return this.principal.scopes.resources.includes('tabular_frontend_contract')
      && request.uri.startsWith('tabular://frontend-contract/v1/');
  }

  /**
   * Handle the allows operation.
   */
  public allows(action: CapabilityAction) {
    const tool = actionTools.get(action.type);
    return Boolean(tool && this.principal.scopes.tools.includes(tool));
  }

  /**
   * Return the transaction cancelled value.
   */
  public get transactionCancelled() {
    return this.#transactionCancelled;
  }

  /**
   * Return the transaction deadline exceeded value.
   */
  public get transactionDeadlineExceeded() {
    return this.#transactionDeadlineExceeded || this.execution.deadlineExceeded();
  }

  /**
   * Handle the transaction operation.
   */
  public async transaction<TargetResult, FinalResult = TargetResult>(
    _capability: 'tabular.capability',
    phases: AuthorityPhases<TargetResult, FinalResult>
  ) {
    return this.#transaction(phases, false);
  }

  /**
   * Read the transaction.
   */
  public readTransaction<TargetResult>(phases: AuthorityPhases<TargetResult>) {
    return this.#transaction(phases, true);
  }

  /**
   * Handle the internal transaction operation.
   */
  async #transaction<TargetResult, FinalResult = TargetResult>(
    phases: AuthorityPhases<TargetResult, FinalResult>,
    repeatableRead: boolean
  ) {
    try {
      return await this.database.transaction<TargetResult, FinalResult>('web', {
        signal: this.execution.signal,
        ...(repeatableRead ? { isolation: 'repeatable read' as const } : {}),
        settings: {
          statement_timeout: String(this.execution.timeoutMs),
          lock_timeout: String(this.execution.timeoutMs),
          idle_in_transaction_session_timeout: String(this.execution.timeoutMs)
        },
        resolveRole: async (database) => {
          const mapping = await new IdentityRepository(database).resolveLogin(
            this.actorIdentityId,
            this.connectionId
          );
          await phases.prepareBase?.(database);
          return {
            role: mapping.role_name,
            verifyAfterSet: (effectiveDatabase: DatabaseExecutor) => verifyEffectiveRole(
              effectiveDatabase,
              { oid: mapping.role_oid, name: mapping.role_name }
            )
          };
        },
        ...(phases.finalizeBase ? {
          finalizeBase: (database, result) => phases.finalizeBase!(database, result)
        } : {})
      }, phases.target);
    } catch (error) {
      if (error instanceof PostgreSqlTransactionCancelledError) {
        this.#transactionCancelled = true;
        this.#transactionDeadlineExceeded = this.execution.deadlineExceeded();
      } else if (postgresCode(error) === '57014') {
        this.#transactionDeadlineExceeded = true;
      }
      throw error;
    }
  }
}

/**
 * Return the postgres code result.
 */
function postgresCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';
}
