import type { DatabaseExecutor } from '../../database/helpers/executor.js';

const verifiedProviderSubjectBrand: unique symbol = Symbol('verified-provider-subject');
const browserMutationPrincipalBrand: unique symbol = Symbol('browser-mutation-principal');

export type VerifiedProviderSubject = {
  readonly provider: string;
  readonly issuer: string;
  readonly subject: string;
  readonly displayName?: string;
  readonly authenticatedAt: Date;
  readonly [verifiedProviderSubjectBrand]: true;
};

export abstract class IdentityProviderAdapter<Input> {
  readonly provider: string;
  readonly issuer: string;

  protected constructor(provider: string, issuer: string) {
    this.provider = bounded(provider, 'provider', 1, 63);
    if (!/^[a-z][a-z0-9._-]*$/.test(this.provider)) {
      throw new Error('Verified provider key has an invalid format');
    }
    this.issuer = bounded(issuer, 'issuer', 1, 512);
  }

  abstract verify(input: Input): Promise<VerifiedProviderSubject>;

  protected verifiedSubject(input: {
    subject: string;
    displayName?: string;
    authenticatedAt?: Date;
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

export type BrowserPrincipal = {
  readonly transport: 'browser';
  readonly sessionId: string;
  readonly identityId: string;
  readonly connectionId: string;
  readonly historyScopeId: string;
  readonly displayName?: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
};

export type BrowserMutationPrincipal = BrowserPrincipal & {
  readonly [browserMutationPrincipalBrand]: true;
};

export type EstablishedBrowserSession = {
  readonly principal: BrowserPrincipal;
  readonly cookieToken: string;
  readonly csrfToken: string;
};

export type IdentityCapability =
  | 'catalog.discover'
  | 'tabular.capability'
  | 'tabular.files'
  | 'tabular.realtime'
  | 'tabular.saved-views'
  | 'tabular.operations'
  | 'tabular.import-export';

export type AuthorizedCallback<Result> = (
  database: DatabaseExecutor,
  principal: BrowserPrincipal
) => Promise<Result>;

export type AuthorizedFinalizeCallback<Result, FinalResult = Result> = (
  database: DatabaseExecutor,
  result: Result,
  principal: BrowserPrincipal
) => Promise<FinalResult>;

export function assertVerifiedProviderSubject(
  value: VerifiedProviderSubject
): asserts value is VerifiedProviderSubject {
  if (!value || value[verifiedProviderSubjectBrand] !== true) {
    throw new Error('Identity provider assertion was not verified by a registered adapter');
  }
}

export function issueBrowserMutationPrincipal(
  principal: BrowserPrincipal
): BrowserMutationPrincipal {
  return Object.freeze({
    ...principal,
    [browserMutationPrincipalBrand]: true as const
  });
}

export function isBrowserMutationPrincipal(
  principal: BrowserPrincipal | BrowserMutationPrincipal
): principal is BrowserMutationPrincipal {
  return browserMutationPrincipalBrand in principal
    && principal[browserMutationPrincipalBrand] === true;
}

function bounded(value: string, label: string, minimum: number, maximum: number) {
  if (typeof value !== 'string' || value !== value.trim()) {
    throw new Error(`Verified ${label} must be trimmed text`);
  }
  if (value.length < minimum || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Verified ${label} has an invalid length or control character`);
  }
  return value;
}
