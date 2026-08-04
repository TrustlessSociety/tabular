import { ApplicationError } from '../../../bootstrap/errors.js';
import type { BrowserPrincipal, IdentityCapability } from './contracts.js';

const browserCapabilities = new Set<IdentityCapability>([
  'catalog.discover',
  'tabular.capability',
  'tabular.files',
  'tabular.realtime',
  'tabular.saved-views',
  'tabular.operations',
  'tabular.import-export'
]);

export function requireCapability(
  principal: BrowserPrincipal,
  capability: IdentityCapability | string
) {
  if (principal.transport !== 'browser' || !browserCapabilities.has(capability as IdentityCapability)) {
    throw new ApplicationError('capability_denied', 403, 'The requested capability is denied');
  }
}
