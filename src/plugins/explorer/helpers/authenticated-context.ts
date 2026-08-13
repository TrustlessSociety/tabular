//client
import type { IdentityPluginService } from '../../identity/helpers/service.js';
import type { ExplorerPluginService } from './service.js';

/**
 * Resolves the current browser session and its authorized Explorer snapshot.
 */
export async function authenticatedExplorerContext(
  cookieToken: string | string[] | undefined,
  identity: IdentityPluginService,
  explorer: ExplorerPluginService
) {
  const resumed = await identity.resumeBrowserSession(cookieToken);
  if (!resumed) return undefined;
  return {
    principal: resumed.principal,
    snapshot: await explorer.discover(resumed.principal),
    identity: {
      displayName: resumed.principal.displayName || resumed.principal.identityId
    },
    csrfToken: resumed.csrfToken
  };
}
