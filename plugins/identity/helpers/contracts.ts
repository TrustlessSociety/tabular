//client
import type { DatabaseExecutor } from '../../database/helpers/executor.js';

const verifiedProviderSubjectBrand: unique symbol = Symbol('verified-provider-subject');
const browserMutationPrincipalBrand: unique symbol = Symbol('browser-mutation-principal');

//The verified provider subject contract exported for module callers
export type VerifiedProviderSubject = {
  readonly provider: string,
  readonly issuer: string,
  readonly subject: string,
  readonly displayName?: string,
  readonly authenticatedAt: Date,
  readonly [verifiedProviderSubjectBrand]: true,
};

/**
 * Adapt identity provider behavior to its external boundary.
 */
export abstract class IdentityProviderAdapter<Input> {
  //The provider state retained by this class instance
  public readonly provider: string;
  //The issuer state retained by this class instance
  public readonly issuer: string;

  /**
   * Create a IdentityProviderAdapter instance.
   */
  protected constructor(provider: string, issuer: string) {
    this.provider = bounded(provider, 'provider', 1, 63);
    if (!/^[a-z][a-z0-9._-]*$/.test(this.provider)) {
      throw new Error('Verified provider key has an invalid format');
    }
    this.issuer = bounded(issuer, 'issuer', 1, 512);
  }

  /**
   * Verify the current value.
   */
  public abstract verify(input: Input): Promise<VerifiedProviderSubject>;

  /**
   * Report the verified subject condition.
   */
  protected verifiedSubject(input: {
    subject: string,
    displayName?: string,
    authenticatedAt?: Date,
  }): VerifiedProviderSubject {
    const subject = bounded(input.subject, 'subject', 1, 512);
    const displayName = typeof input.displayName === 'undefined'
      ? undefined
      : bounded(input.displayName, 'display name', 1, 200);
    const authenticatedAt = input.authenticatedAt || new Date();
    if (!Number.isFinite(authenticatedAt.getTime())) {
      throw new Error('Verified authentication time is invalid');
    }
    return {
      provider: this.provider,
      issuer: this.issuer,
      subject,
      displayName,
      authenticatedAt,
      [verifiedProviderSubjectBrand]: true
    };
  }
}

//The browser principal contract exported for module callers
export type BrowserPrincipal = {
  readonly transport: 'browser',
  readonly sessionId: string,
  readonly identityId: string,
  readonly connectionId: string,
  readonly historyScopeId: string,
  readonly displayName?: string,
  readonly idleExpiresAt: Date,
  readonly absoluteExpiresAt: Date,
};

//The browser mutation principal contract exported for module callers
export type BrowserMutationPrincipal = BrowserPrincipal & {
  readonly [browserMutationPrincipalBrand]: true,
};

//The established browser session contract exported for module callers
export type EstablishedBrowserSession = {
  readonly principal: BrowserPrincipal,
  readonly cookieToken: string,
  readonly csrfToken: string,
};

//The identity capability contract exported for module callers
export type IdentityCapability =
  | 'catalog.discover'
  | 'tabular.capability'
  | 'tabular.files'
  | 'tabular.realtime'
  | 'tabular.saved-views'
  | 'tabular.operations'
  | 'tabular.import-export';

//The authorized callback contract exported for module callers
export type AuthorizedCallback<Result> = (
  database: DatabaseExecutor,
  principal: BrowserPrincipal
) => Promise<Result>;

//The authorized finalize callback contract exported for module callers
export type AuthorizedFinalizeCallback<Result, FinalResult = Result> = (
  database: DatabaseExecutor,
  result: Result,
  principal: BrowserPrincipal
) => Promise<FinalResult>;

/**
 * Assert the verified provider subject.
 */
export function assertVerifiedProviderSubject(
  value: VerifiedProviderSubject
): asserts value is VerifiedProviderSubject {
  if (!value || value[verifiedProviderSubjectBrand] !== true) {
    throw new Error('Identity provider assertion was not verified by a registered adapter');
  }
}

/**
 * Return the issue browser mutation principal result.
 */
export function issueBrowserMutationPrincipal(
  principal: BrowserPrincipal
): BrowserMutationPrincipal {
  return Object.freeze({
    ...principal,
    [browserMutationPrincipalBrand]: true as const
  });
}

/**
 * Report whether the browser mutation principal condition holds.
 */
export function isBrowserMutationPrincipal(
  principal: BrowserPrincipal | BrowserMutationPrincipal
): principal is BrowserMutationPrincipal {
  return browserMutationPrincipalBrand in principal
    && principal[browserMutationPrincipalBrand] === true;
}

/**
 * Return the bounded result.
 */
function bounded(value: string, label: string, minimum: number, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim()) {
    throw new Error(`Verified ${label} must be trimmed text`);
  }
  if (value.length < minimum || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Verified ${label} has an invalid length or control character`);
  }
  return value;
}
