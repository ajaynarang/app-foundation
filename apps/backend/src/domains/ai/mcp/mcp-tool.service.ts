import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { jsonSchema, type ToolSet } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { SCOPE_TIERS, scopeTier } from '@app/shared-types';
import { confirmActionTool } from '../assistant/mastra/tools/confirm-action.tool';
import { InvocationPipelineService } from '../agent-contract/invocation-pipeline.service';
import { getRequiredScope } from '../agent-contract/requires-scope.decorator';
import { fromUser } from '@appshore/platform/auth/agent-principal';
import { scopesForRole } from '../agent-contract/role-scopes';
import { CITATIONS_SIDE_CHANNEL, type TurnEvidence } from './turn-evidence';
import { toolFailure } from './tools/tool-error';

/**
 * Context the AI (chat) path needs to invoke tools for a real user. Required: there is no anonymous chat, and a
 * tool never runs without the pipeline.
 *
 * - `userId` is the wire-format user id (e.g. JWT `sub` — `"user_demo_owner"`).
 * - `userDbId` is the numeric DB id (`User.id`), used for AgentPrincipal construction. Callers resolve it from
 *   `userId` via `BaseTenantController.getUserDbId` (or an equivalent helper) before reaching this service, so the
 *   resolution happens once per request.
 */
export interface McpToolInvocationContext {
  tenantId: number;
  userId: string;
  userDbId: number;
  conversationId?: string;
}

/**
 * Accumulates `_card` metadata emitted by MCP tools during a single request.
 * The last emitted card wins — tools called later in multi-step flows override earlier ones.
 */
export class CardAccumulator {
  private _card: Record<string, unknown> | null = null;

  capture(card: Record<string, unknown>) {
    this._card = card;
  }

  get card(): Record<string, unknown> | null {
    return this._card;
  }
}

/** What a chat tool call answers when the pipeline is not wired: the call is refused, never run directly. */
export const TOOL_PIPELINE_UNAVAILABLE = 'tool_pipeline_unavailable';

/**
 * Bridges MCP-registered tools into AI SDK ToolSet format for the chat assistant.
 *
 * Every call runs through `InvocationPipelineService` (scope, arguments, role, plan, confirmation, audit). There is
 * no direct path to a tool method in this file: if the pipeline is missing, the call is refused with
 * `tool_pipeline_unavailable`.
 */
@Injectable()
export class McpToolService implements OnModuleInit {
  private readonly logger = new Logger(McpToolService.name);
  private allTools: Map<string, any> = new Map();
  private mcpModuleId: string | null = null;

  constructor(
    private readonly registry: McpRegistryDiscoveryService,
    @Optional() private readonly pipeline?: InvocationPipelineService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies OnModuleInit contract
  async onModuleInit() {
    try {
      this.discoverTools();
    } catch {
      // MCP modules may not be registered yet during startup.
      // Schedule a retry so tools are warm before the first voice/chat request.
      setTimeout(() => {
        try {
          if (this.allTools.size === 0) {
            this.discoverTools();
          }
        } catch (err) {
          this.logger.warn('MCP tool prewarm retry failed — will discover on first use', err);
        }
      }, 5_000);
    }
  }

  private discoverTools() {
    // Find the MCP module ID from the registry
    const moduleIds = this.registry.getMcpModuleIds();
    if (moduleIds.length === 0) {
      this.logger.warn('No MCP modules registered yet');
      return;
    }
    this.mcpModuleId = moduleIds[0];

    const tools = this.registry.getTools(this.mcpModuleId);

    for (const tool of tools) {
      this.allTools.set(tool.metadata.name, tool);
    }

    this.logger.log(`Discovered ${this.allTools.size} MCP tools: ${[...this.allTools.keys()].join(', ')}`);
  }

  /**
   * Get AI SDK-compatible tools for the generic assistant.
   *
   * The starter exposes every discovered MCP tool to the single assistant persona. Each call goes through the
   * pipeline, whose executor injects the session identity (`_tenantId`, `_userId`, `_userDbId`, `_role`); the
   * pipeline drops every `_` key the model sends, so the model never controls them. Tenant isolation is each tool's
   * own `_tenantId` filter; no transaction or role switch is opened around a tool call.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Promise<ToolSet> is part of the public API contract
  async getToolsForPersona(
    userMode: string,
    context: McpToolInvocationContext,
    cardAccumulator?: CardAccumulator,
    evidence?: TurnEvidence,
  ): Promise<ToolSet> {
    if (this.allTools.size === 0) {
      this.discoverTools();
    }

    const tools: ToolSet = {};

    for (const toolName of this.allTools.keys()) {
      const registeredTool = this.allTools.get(toolName);
      if (!registeredTool) continue;

      const { metadata } = registeredTool;

      let rawSchema: Record<string, unknown>;
      if (metadata.parameters && typeof metadata.parameters === 'object' && 'shape' in metadata.parameters) {
        rawSchema = zodToJsonSchema(metadata.parameters);
      } else {
        rawSchema = { type: 'object', properties: {} };
      }
      const inputSchema = jsonSchema(rawSchema as any);

      tools[toolName] = {
        description: metadata.description ?? '',
        inputSchema,
        execute: async (args: any) => {
          if (!this.pipeline) {
            this.logger.error(`InvocationPipelineService unavailable — refusing ${toolName}`);
            return { error: TOOL_PIPELINE_UNAVAILABLE, tool: toolName };
          }
          const result = await this.runViaPipeline(toolName, args ?? {}, context, userMode, cardAccumulator);
          return takeCitations(result, evidence);
        },
      };
    }

    return tools;
  }

  /**
   * Route a single tool invocation through InvocationPipelineService and return the AI-SDK-compatible unwrapped
   * result. A throw from the pipeline (its own audit write failing, say) reaches the model as a safe failure, never
   * as the raw error message.
   */
  private async runViaPipeline(
    toolName: string,
    args: Record<string, unknown>,
    context: McpToolInvocationContext,
    userMode: string,
    cardAccumulator?: CardAccumulator,
  ): Promise<unknown> {
    if (!this.pipeline) return { error: TOOL_PIPELINE_UNAVAILABLE, tool: toolName };

    // `role` here only selects the scope set (it mirrors the persona). A tool's `@RestrictToRoles` is checked in the
    // pipeline against the user's current role in this workspace.
    const role = userMode.toUpperCase();
    const principal = fromUser({
      userId: context.userDbId,
      tenantId: context.tenantId,
      role,
      scopes: scopesForRole(role),
    });

    try {
      const result = await this.pipeline.run(principal, toolName, args);
      if (cardAccumulator && (result as any)._card) {
        cardAccumulator.capture((result as any)._card);
      }
      const textContent = result.content?.find((c) => c.type === 'text');
      if (textContent) {
        try {
          return JSON.parse(textContent.text);
        } catch {
          return textContent.text;
        }
      }
      return result;
    } catch (err) {
      return toolFailure(err, this.logger, toolName);
    }
  }

  /**
   * A write is any tool whose `@RequiresScope` is not read tier: the same rule the pipeline uses
   * (`ScopeRegistryService.isWriteTool`), so the confirm offer and server enforcement cannot disagree. There is no
   * hand-kept write list.
   */
  isWriteTool(toolName: string): boolean {
    const registered = this.allTools.get(toolName);
    if (!registered?.providerClass?.prototype) return false;
    const scope = getRequiredScope(registered.providerClass.prototype, registered.methodName);
    return scope !== undefined && scopeTier(scope) !== SCOPE_TIERS.READ;
  }

  /**
   * Lookup metadata for a single tool by name. Returns `null` when the tool hasn't been discovered yet (registry
   * cold) or doesn't exist. Read or write comes from the tool's scope tier.
   */
  getToolMetadata(toolName: string): { description: string; kind: 'read' | 'write' } | null {
    if (this.allTools.size === 0) this.discoverTools();
    const registered = this.allTools.get(toolName);
    if (!registered) return null;
    return {
      description: registered.metadata?.description ?? '',
      kind: this.isWriteTool(toolName) ? 'write' : 'read',
    };
  }

  /** Every write tool known to the registry, derived from scope tiers. */
  getAllWriteTools(): string[] {
    if (this.allTools.size === 0) this.discoverTools();
    return [...this.allTools.keys()].filter((name) => this.isWriteTool(name)).sort();
  }

  /**
   * Get tools in Mastra's `toolsets` format for dynamic injection.
   *
   * Returns `{ 'app-tools': { ...mcpTools, 'confirm-action': ... } }`
   * which is passed to `agent.stream()` / `agent.generate()` via `toolsets`.
   *
   * `confirm-action` is offered when the toolset holds a write.
   */
  async getToolsetsForPersona(
    userMode: string,
    context: McpToolInvocationContext,
    cardAccumulator?: CardAccumulator,
    evidence?: TurnEvidence,
  ): Promise<Record<string, ToolSet>> {
    const tools = await this.getToolsForPersona(userMode, context, cardAccumulator, evidence);

    const hasWriteTools = Object.keys(tools).some((t) => this.isWriteTool(t));
    if (hasWriteTools) {
      (tools as any)['confirm-action'] = confirmActionTool;
    }

    return { 'app-tools': tools };
  }
}

/**
 * Move a tool result's `_citations` side channel into the turn's evidence and strip it, so the model never sees it.
 * With no evidence collecting (a delegated execute) the key is still stripped.
 */
export function takeCitations(result: unknown, evidence?: TurnEvidence): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !(CITATIONS_SIDE_CHANNEL in result)) {
    return result;
  }
  const { [CITATIONS_SIDE_CHANNEL]: offered, ...rest } = result as Record<string, unknown>;
  if (evidence && Array.isArray(offered)) evidence.offer(offered);
  return rest;
}
