import type {
  AuthorityPhases,
  CapabilityAction
} from '../../capability/helpers/contracts.js';
import type { DatabaseExecutor } from '../../database/helpers/executor.js';
import type { DatabasePluginService } from '../../database/helpers/service.js';
import { PostgreSqlTransactionCancelledError } from '../../database/helpers/transactions.js';
import {
  IdentityRepository,
  verifyEffectiveRole
} from '../../identity/helpers/repository.js';
import {
  GovernedMcpExecutionContext,
  MCP_CAPABILITY_ACTIONS,
  type McpCapabilityToolName,
  type McpTransportRequest,
  type VerifiedMcpPrincipal
} from './contracts.js';

const actionTools = new Map<CapabilityAction['type'], McpCapabilityToolName>(
  Object.entries(MCP_CAPABILITY_ACTIONS).map(([tool, action]) => [
    action,
    tool as McpCapabilityToolName
  ])
);

export type McpExecutionBoundary = {
  signal: AbortSignal;
  timeoutMs: number;
  deadlineExceeded(): boolean;
};

export class WebPoolGovernedMcpAuthority extends GovernedMcpExecutionContext {
  #transactionCancelled = false;
  #transactionDeadlineExceeded = false;

  constructor(
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

  allowsMcp(request: McpTransportRequest) {
    if (request.kind === 'tool') return this.principal.scopes.tools.includes(request.name);
    return this.principal.scopes.resources.includes('tabular_frontend_contract')
      && request.uri.startsWith('tabular://frontend-contract/v1/');
  }

  allows(action: CapabilityAction) {
    const tool = actionTools.get(action.type);
    return Boolean(tool && this.principal.scopes.tools.includes(tool));
  }

  get transactionCancelled() {
    return this.#transactionCancelled;
  }

  get transactionDeadlineExceeded() {
    return this.#transactionDeadlineExceeded || this.execution.deadlineExceeded();
  }

  async transaction<TargetResult, FinalResult = TargetResult>(
    _capability: 'tabular.capability',
    phases: AuthorityPhases<TargetResult, FinalResult>
  ) {
    return this.#transaction(phases, false);
  }

  readTransaction<TargetResult>(phases: AuthorityPhases<TargetResult>) {
    return this.#transaction(phases, true);
  }

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

function postgresCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';
}
