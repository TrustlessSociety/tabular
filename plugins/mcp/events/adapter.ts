//client
import type {
  McpCallOptions,
  McpCredentialVerifier,
  McpResourceResponse,
  McpToolResponse
} from '../helpers/contracts.js';
import type { McpPluginService } from '../helpers/service.js';

/**
 * Provider-neutral transport boundary. Raw credentials stop here; only a
 * runtime-branded principal reaches the service's tool/resource methods.
 */
export class GovernedMcpTransportAdapter<Credential> {
  /**
   * Create a GovernedMcpTransportAdapter instance.
   */
  public constructor(
    private readonly service: McpPluginService,
    private readonly verifier: McpCredentialVerifier<Credential>
  ) {}

  /**
   * List the tools.
   */
  public async listTools(credential: Credential) {
    try {
      const principal = await this.service.verifyCredential(this.verifier, credential);
      return this.service.tools(principal);
    } catch {
      return [];
    }
  }

  /**
   * List the resource templates.
   */
  public async listResourceTemplates(credential: Credential) {
    try {
      const principal = await this.service.verifyCredential(this.verifier, credential);
      return this.service.resourceTemplates(principal);
    } catch {
      return [];
    }
  }

  /**
   * Handle the call tool operation.
   */
  public async callTool(
    credential: Credential,
    input: unknown,
    options?: McpCallOptions
  ): Promise<McpToolResponse> {
    try {
      const principal = await this.service.verifyCredential(this.verifier, credential);
      return this.service.callTool(principal, input, options);
    } catch {
      return deniedTool();
    }
  }

  /**
   * Read the resource.
   */
  public async readResource(
    credential: Credential,
    input: unknown,
    options?: McpCallOptions
  ): Promise<McpResourceResponse> {
    try {
      const principal = await this.service.verifyCredential(this.verifier, credential);
      return this.service.readResource(principal, input, options);
    } catch {
      return deniedResource();
    }
  }
}

/**
 * Report the denied tool condition.
 */
function deniedTool(): McpToolResponse {
  const error = {
    category: 'capability_denied',
    description: 'The requested capability is denied',
    canRetry: false
  };
  return {
    isError: true,
    content: [{ type: 'text', text: error.description }],
    structuredContent: { error }
  };
}

/**
 * Report the denied resource condition.
 */
function deniedResource(): McpResourceResponse {
  return {
    isError: true,
    contents: [],
    structuredContent: {
      error: {
        category: 'capability_denied',
        description: 'The requested capability is denied',
        canRetry: false
      }
    }
  };
}
