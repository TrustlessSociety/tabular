import type {
  McpCallOptions,
  McpCredentialVerifier,
  McpResourceResponse,
  McpToolResponse
} from '../helpers/contracts.js';
import type { McpPluginService } from '../helpers/service.js';

/** Provider-neutral transport boundary. Raw credentials stop here; only a
 * runtime-branded principal reaches the service's tool/resource methods. */
export class GovernedMcpTransportAdapter<Credential> {
  constructor(
    private readonly service: McpPluginService,
    private readonly verifier: McpCredentialVerifier<Credential>
  ) {}

  async listTools(credential: Credential) {
    try {
      const principal = await this.service.verifyCredential(this.verifier, credential);
      return this.service.tools(principal);
    } catch {
      return [];
    }
  }

  async listResourceTemplates(credential: Credential) {
    try {
      const principal = await this.service.verifyCredential(this.verifier, credential);
      return this.service.resourceTemplates(principal);
    } catch {
      return [];
    }
  }

  async callTool(
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

  async readResource(
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
