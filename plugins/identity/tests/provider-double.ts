//client
import type { VerifiedProviderSubject } from '../helpers/contracts.js';
import { IdentityProviderAdapter } from '../helpers/contracts.js';

//The test provider input contract exported for module callers
export type TestProviderInput = {
  assertion: string,
  subject?: string,
  email?: string,
  displayName?: string,
  role?: string,
  superuser?: boolean,
  bypassRls?: boolean,
};

/**
 * Provide the test identity provider behavior used by this module.
 */
export class TestIdentityProvider extends IdentityProviderAdapter<TestProviderInput> {
  /**
   * Create a TestIdentityProvider instance.
   */
  public constructor() {
    super('test-provider', 'https://issuer.test');
  }

  /**
   * Verify the current value.
   */
  public async verify(input: TestProviderInput): Promise<VerifiedProviderSubject> {
    if (input.assertion !== 'verified-test-assertion') {
      throw new Error('Test provider assertion is invalid');
    }
    if (!input.subject) {
      throw new Error('Test provider requires an immutable subject');
    }
    return this.verifiedSubject({
      subject: input.subject,
      displayName: input.displayName,
      authenticatedAt: new Date('2026-08-01T00:00:00.000Z')
    });
  }
}
