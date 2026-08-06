//client
import type {
  BrowserMutationPrincipal,
  BrowserPrincipal
} from '../../identity/helpers/contracts.js';
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { CapabilityAction } from '../helpers/contracts.js';
import type { CapabilityPluginService } from '../helpers/service.js';
import { BrowserAuthorizedExecutionContext } from '../helpers/web-authority.js';

//The web action response contract exported for module callers
export type WebActionResponse =
  | { status: 'ok', data: unknown, }
  | {
    status: 'error',
    error: { code: string, message: string, retryable: boolean, issues?: unknown[], },
  };

/**
 * Adapt web capability behavior to its external boundary.
 */
export class WebCapabilityAdapter {
  /**
   * Create a WebCapabilityAdapter instance.
   */
  public constructor(
    private readonly identity: IdentityPluginService,
    private readonly capability: CapabilityPluginService
  ) {}

  /**
   * Handle the invoke operation.
   */
  public async invoke(
    principal: BrowserPrincipal | BrowserMutationPrincipal,
    body: unknown
  ): Promise<WebActionResponse> {
    let envelope: Record<string, unknown>;
    try {
      envelope = strictEnvelope(body, ['action']);
    } catch {
      return invalidWebAction();
    }
    const result = await this.capability.execute(
      new BrowserAuthorizedExecutionContext(this.identity, principal),
      envelope.action as CapabilityAction
    );
    if (result.ok) return { status: 'ok', data: result.value };
    return {
      status: 'error',
      error: {
        code: result.error.code,
        message: result.error.message,
        retryable: result.error.retryable,
        ...(result.error.issues ? { issues: result.error.issues } : {})
      }
    };
  }
}

/**
 * Report the invalid web action condition.
 */
function invalidWebAction(): WebActionResponse {
  return {
    status: 'error',
    error: {
      code: 'invalid_action',
      message: 'The action is invalid',
      retryable: false
    }
  };
}

/**
 * Return the strict envelope result.
 */
function strictEnvelope(input: unknown, keys: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The web action envelope is invalid');
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !keys.includes(key)) || !('action' in record)) {
    throw new Error('The web action envelope is invalid');
  }
  return record;
}
