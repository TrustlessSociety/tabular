//client
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { AuthorityPhases, CapabilityAction } from './contracts.js';
import { isBrowserMutationPrincipal } from '../../identity/helpers/contracts.js';
import { AuthorizedExecutionContext } from './contracts.js';

const allowedWebReads = new Set<CapabilityAction['type']>([
  'record.read',
  'draft.read',
  'draft.list',
  'history.list'
]);

const allowedWebMutations = new Set<CapabilityAction['type']>([
  'record.patch',
  'record.insert',
  'record.delete',
  'range.patch',
  'draft.create',
  'draft.update',
  'draft.delete',
  'draft.promote',
  'history.undo',
  'history.redo'
]);

/**
 * Provide the browser authorized execution context behavior used by this module.
 */
export class BrowserAuthorizedExecutionContext extends AuthorizedExecutionContext {
  //The surface state retained by this class instance
  public readonly surface = 'web' as const;

  /**
   * Create a BrowserAuthorizedExecutionContext instance.
   */
  public constructor(
    private readonly identity: IdentityPluginService,
    private readonly principal: BrowserPrincipal | BrowserMutationPrincipal
  ) {
    super({
      actorIdentityId: principal.identityId,
      sessionId: principal.sessionId,
      historyScopeId: principal.historyScopeId,
      connectionId: principal.connectionId,
      expiresAt: principal.absoluteExpiresAt
    });
  }

  /**
   * Handle the allows operation.
   */
  public allows(action: CapabilityAction) {
    return allowedWebReads.has(action.type)
      || (isBrowserMutationPrincipal(this.principal) && allowedWebMutations.has(action.type));
  }

  /**
   * Handle the transaction operation.
   */
  public transaction<TargetResult, FinalResult = TargetResult>(
    _capability: 'tabular.capability',
    phases: AuthorityPhases<TargetResult, FinalResult>
  ) {
    return this.identity.authorizedTransaction<TargetResult, FinalResult>(
      this.principal,
      'tabular.capability',
      phases.target,
      phases.prepareBase,
      phases.finalizeBase
        ? (database, result) => phases.finalizeBase!(database, result)
        : undefined,
      'read committed'
    );
  }
}
