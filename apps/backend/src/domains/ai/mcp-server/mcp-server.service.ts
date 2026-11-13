import { HttpException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { InvocationPipelineService } from '../agent-contract/invocation-pipeline.service';
import { toolFailure } from '../mcp/tools/tool-error';
import { ScopeRegistryService } from '../agent-contract/scope-registry.service';
import { ToolAccessPolicyService } from '../agent-contract/tool-access-policy.service';
import { ToolAvailabilityService } from '../agent-contract/tool-availability.service';
import { PromptRegistryService } from '../assistant/prompts/prompt-registry.service';
import { fromOAuthUser } from '@appshore/platform/auth/agent-principal';
import type { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { scopeTier, SCOPE_TIERS, type AgentScope } from '@app/shared-types';
import type { OAuthUser } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';
import type { Request, Response } from 'express';

type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type McpPromptDescriptor = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
};

type McpPromptResult = {
  description: string;
  messages: Array<{ role: 'user'; content: { type: 'text'; text: string } }>;
};

@Injectable()
export class McpServerService implements OnModuleInit {
  private readonly logger = new Logger(McpServerService.name);

  constructor(
    private readonly pipeline: InvocationPipelineService,
    private readonly scopeRegistry: ScopeRegistryService,
    private readonly accessPolicy: ToolAccessPolicyService,
    private readonly toolAvailability: ToolAvailabilityService,
    private readonly prompts: PromptRegistryService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies OnModuleInit contract
  async onModuleInit() {
    this.logger.log('MCP external server service initialized');
  }

  /**
   * Handle an MCP Streamable HTTP request for an OAuth principal.
   */
  async handleRequest(req: Request, res: Response, oauthUser: OAuthUser) {
    // oauthUser.userId is the JWT `sub` — signed as String(user.id) by
    // OAuthProviderService.issueTokens, so the coercion is a round-trip.
    const principal = fromOAuthUser({
      onBehalfOfUserDbId: Number(oauthUser.userId),
      tenantDbId: oauthUser.tenantDbId,
      role: oauthUser.role,
      scopes: oauthUser.scopes as AgentScope[],
      clientId: oauthUser.clientId,
    });
    await this.handleMcpStreamable(req, res, principal);
  }

  /**
   * Handle an MCP Streamable HTTP request for an already-resolved AgentPrincipal.
   * Used by the API-key route which resolves the principal in the guard.
   */
  async handleRequestFromPrincipal(req: Request, res: Response, principal: AgentPrincipal): Promise<void> {
    await this.handleMcpStreamable(req, res, principal);
  }

  /**
   * Core MCP transport setup — creates a per-request Server with tools filtered by scopes and availability and
   * prompts filtered by the acting person's role, wires up the tools and prompts handlers, then handles transport.
   */
  private async handleMcpStreamable(req: Request, res: Response, principal: AgentPrincipal): Promise<void> {
    const server = new Server(
      { name: 'app-assistant', version: '1.0.0' },
      { capabilities: { tools: {}, prompts: {} } },
    );

    // tools/list — registry-driven, filtered by principal scopes
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return Promise.resolve({ tools: this.listToolsForPrincipal(principal) });
    });

    // tools/call — delegates to executeToolCallForPrincipal for testability
    server.setRequestHandler(CallToolRequestSchema, async (request): Promise<unknown> => {
      const toolName = request.params.name;
      const args = request.params.arguments ?? {};
      return this.executeToolCallForPrincipal(toolName, args, principal);
    });

    // prompts/list — the prompt library, filtered by the acting person's role in this workspace
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts: await this.listPromptsForPrincipal(principal) };
    });

    // prompts/get — one prompt rendered into messages, gated by the same role
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return this.getPromptForPrincipal(request.params.name, request.params.arguments ?? {}, principal);
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
    });

    await server.connect(transport);

    try {
      await transport.handleRequest(req, res, req.body);
    } finally {
      await transport.close();
      await server.close();
    }
  }

  /**
   * Return MCP-shape tool descriptors, restricted to the principal's granted
   * scopes. Expansion of implied scopes happens inside the scope registry.
   *
   * Each tool carries `annotations` derived from its scope tier so MCP clients
   * (Claude.ai, ChatGPT, Cursor) can group them as Read-only / Write-delete.
   * Per the 2025-03-26 MCP spec these are best-effort hints — clients use them
   * for grouping and consent-screen language but they are NOT a security
   * boundary; the pipeline still gates every call by scope + HITL.
   *
   * A tool `ToolAvailabilityService` withholds (its channel is not configured) is left out, so an agent is never
   * offered an action that cannot be delivered.
   */
  listToolsForPrincipal(principal: AgentPrincipal): Array<{
    name: string;
    description: string;
    inputSchema: unknown;
    annotations: {
      title: string;
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
      openWorldHint: boolean;
    };
  }> {
    const allowed = this.scopeRegistry.toolsAllowedByScopes(principal.scopes);
    return this.scopeRegistry
      .getAllTools()
      .filter((t) => allowed.has(t.name) && this.toolAvailability.isAvailable(t.name))
      .map((t) => {
        const tier = scopeTier(t.scope);
        const isRead = tier === SCOPE_TIERS.READ;
        const isSensitive = tier === SCOPE_TIERS.SENSITIVE;
        return {
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: {
            title: t.name,
            readOnlyHint: isRead,
            // Sensitive writes touch destructive territory (void invoice,
            // delete records, deactivate accounts). Standard writes
            // (create/update) aren't destructive in the spec's sense.
            destructiveHint: isSensitive,
            // Reads are idempotent; writes generally aren't.
            idempotentHint: isRead,
            // The platform is a closed-world tenant API — no open internet calls.
            openWorldHint: false,
          },
        };
      });
  }

  /**
   * MCP prompt descriptors the principal may see. The role is the acting person's CURRENT role in this workspace
   * (`WorkspaceMember`, the same lookup the tool pipeline's role step uses), never the role in the token, which can
   * be stale. A person with no membership sees no prompts.
   */
  async listPromptsForPrincipal(principal: AgentPrincipal): Promise<McpPromptDescriptor[]> {
    const role = await this.accessPolicy.actingRole(principal);
    return this.prompts.listForRole(role).map((p) => ({
      name: p.name,
      title: p.title,
      description: p.description,
      arguments: p.arguments.map((a) => ({ name: a.name, description: a.description, required: a.required })),
    }));
  }

  /**
   * Render one prompt into MCP messages, gated by the acting person's role. A prompt the caller may not see, an
   * unknown one, an undeclared argument and a missing required one all answer MCP's invalid-params error with the
   * registry's safe message. Anything else is thrown as is, and the SDK answers it as an internal error.
   */
  async getPromptForPrincipal(
    name: string,
    args: Record<string, string | undefined>,
    principal: AgentPrincipal,
  ): Promise<McpPromptResult> {
    const role = await this.accessPolicy.actingRole(principal);
    try {
      const prompt = this.prompts.getForRole(name, role);
      const text = this.prompts.render(name, role, args);
      return { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text } }] };
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() < 500) {
        throw new McpError(ErrorCode.InvalidParams, httpDetail(err));
      }
      throw err;
    }
  }

  /**
   * Execute a tool call for a typed AgentPrincipal.
   * Always routes through InvocationPipelineService (scope, arguments, role, plan, confirmation, audit). A throw from
   * the pipeline itself reaches the agent as a safe failure (`toolFailure`), never as the raw error message.
   */
  async executeToolCallForPrincipal(
    toolName: string,
    args: Record<string, unknown>,
    principal: AgentPrincipal,
  ): Promise<McpToolResult> {
    try {
      return await this.pipeline.run(principal, toolName, args);
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(toolFailure(err, this.logger, toolName)) }],
        isError: true,
      };
    }
  }

  /**
   * Execute a tool call — thin wrapper around executeToolCallForPrincipal.
   * Builds an AgentPrincipal from OAuthUser and delegates.
   */
  async executeToolCall(toolName: string, args: Record<string, unknown>, oauthUser: OAuthUser): Promise<McpToolResult> {
    const principal = fromOAuthUser({
      onBehalfOfUserDbId: Number(oauthUser.userId),
      tenantDbId: oauthUser.tenantDbId,
      role: oauthUser.role,
      scopes: oauthUser.scopes as AgentScope[],
      clientId: oauthUser.clientId,
    });
    return this.executeToolCallForPrincipal(toolName, args, principal);
  }
}

/** The client-safe copy of a 4xx: the envelope's `detail`, else Nest's `message`. */
function httpDetail(err: HttpException): string {
  const body = err.getResponse();
  if (typeof body === 'string') return body;
  const { detail, message } = body as { detail?: unknown; message?: unknown };
  if (typeof detail === 'string') return detail;
  if (typeof message === 'string') return message;
  return err.message;
}
