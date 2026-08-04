import {
  isBrowserMutationPrincipal,
  type BrowserMutationPrincipal,
  type BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import {
  AuthorizedExecutionContext,
  type AuthorityPhases,
  type CapabilityAction
} from './contracts.js';

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

export class BrowserAuthorizedExecutionContext extends AuthorizedExecutionContext {
  readonly surface = 'web' as const;

  constructor(
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

  allows(action: CapabilityAction) {
    return allowedWebReads.has(action.type)
      || (isBrowserMutationPrincipal(this.principal) && allowedWebMutations.has(action.type));
  }

  transaction<TargetResult, FinalResult = TargetResult>(
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
