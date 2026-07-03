import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { InvocationPipelineService, PipelineError } from '../agent-contract/invocation-pipeline.service';
import { ScopeRegistryService } from '../agent-contract/scope-registry.service';
import { fromOAuthUser } from '@appshore/platform/auth/agent-principal';
import type { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { scopeTier, SCOPE_TIERS, type AgentScope } from '@app/shared-types';
import type { OAuthUser } from '@appshore/platform/domains/platform/oauth-provider/oauth-token.guard';
import type { Request, Response } from 'express';

type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

@Injectable()
export class McpServerService implements OnModuleInit {
  private readonly logger = new Logger(McpServerService.name);

  constructor(
    private readonly pipeline: InvocationPipelineService,
    private readonly scopeRegistry: ScopeRegistryService,
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
   * Core MCP transport setup — creates a per-request Server with tools filtered
   * by scopes, wires up tools/list and tools/call handlers, then handles transport.
   */
  private async handleMcpStreamable(req: Request, res: Response, principal: AgentPrincipal): Promise<void> {
    const server = new Server({ name: 'app-assistant', version: '1.0.0' }, { capabilities: { tools: {} } });

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
      .filter((t) => allowed.has(t.name))
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
   * Execute a tool call for a typed AgentPrincipal.
   * Always routes through InvocationPipelineService (scope + HITL + audit).
   */
  async executeToolCallForPrincipal(
    toolName: string,
    args: Record<string, unknown>,
    principal: AgentPrincipal,
  ): Promise<McpToolResult> {
    try {
      return await this.pipeline.run(principal, toolName, args);
    } catch (err) {
      if (err instanceof PipelineError) {
        this.logger.warn(`external-mcp pipeline rejected (${err.message}) for tool=${toolName}`);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'pipeline_error',
                tool: toolName,
                reason: err.message,
              }),
            },
          ],
          isError: true,
        };
      }
      throw err;
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
