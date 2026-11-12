import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { jsonSchema, type ToolSet } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { confirmActionTool } from '../assistant/mastra/tools/confirm-action.tool';
import { InvocationPipelineService, PipelineError } from '../agent-contract/invocation-pipeline.service';
import { fromUser } from '@appshore/platform/auth/agent-principal';
import { scopesForRole } from '../agent-contract/role-scopes';
import { CITATIONS_SIDE_CHANNEL, type TurnEvidence } from './turn-evidence';

/**
 * Accumulates `_card` metadata emitted by MCP tools during a single request.
 * The last emitted card wins — tools called later in multi-step flows override earlier ones.
 */
/**
 * Context the AI (chat) path needs to invoke tools safely for a real user.
 *
 * - `userId` is the wire-format user id (e.g. JWT `sub` — `"user_demo_owner"`),
 *   injected into tool args as `_userId` for downstream lookups.
 * - `userDbId` is the numeric DB id (`User.id`), used for AgentPrincipal
 *   construction. Callers resolve it from `userId` via
 *   `BaseTenantController.getUserDbId` (or an equivalent helper) before
 *   reaching this service, so the resolution happens once per request.
 */
export interface McpToolInvocationContext {
  tenantId: number;
  userId: string;
  userDbId: number;
  conversationId?: string;
}

export class CardAccumulator {
  private _card: Record<string, unknown> | null = null;

  capture(card: Record<string, unknown>) {
    this._card = card;
  }

  get card(): Record<string, unknown> | null {
    return this._card;
  }
}

/**
 * Bridges MCP-registered tools into AI SDK ToolSet format.
 *
 * Uses McpRegistryService to discover tools (avoids McpExecutorService which
 * is request-scoped and not exported by McpModule). Tool execution resolves
 * the provider via ModuleRef and calls the decorated method directly.
 */
@Injectable()
export class McpToolService implements OnModuleInit {
  private readonly logger = new Logger(McpToolService.name);
  private allTools: Map<string, any> = new Map();
  private mcpModuleId: string | null = null;

  constructor(
    private readonly registry: McpRegistryDiscoveryService,
    private readonly moduleRef: ModuleRef,
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
   * The starter exposes every discovered MCP tool to the single assistant
   * persona. To gate tools per persona, reintroduce an allowlist lookup here.
   *
   * When `context` is provided, `_tenantId` and `_userId` are injected into
   * every tool call's arguments, ensuring tenant isolation at the service boundary.
   * The AI never controls these values — they come from the authenticated session.
   * Tenant isolation is each tool's own `_tenantId` filter; no transaction or
   * role switch is opened around a tool call.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Promise<ToolSet> is part of the public API contract
  async getToolsForPersona(
    userMode: string,
    context?: McpToolInvocationContext,
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

      const { providerClass, methodName, metadata } = registeredTool;

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
          // Inject tenant context into tool arguments — this is the security boundary.
          // Tools use _tenantId to scope all queries. The AI cannot override these.
          const injectedArgs = context
            ? {
                ...args,
                _tenantId: context.tenantId,
                _userId: context.userId,
                _conversationId: context.conversationId,
              }
            : args;

          if (context && this.pipeline) {
            const pipelineResult = await this.runViaPipeline(toolName, args, context, userMode, cardAccumulator);
            if (pipelineResult !== undefined) return takeCitations(pipelineResult, evidence);
          }

          const callTool = async () => {
            // Resolve the provider instance and call the decorated method directly
            const instance = this.moduleRef.get(providerClass, {
              strict: false,
            });
            const result = await instance[methodName](injectedArgs);

            // Capture _card metadata before unwrapping MCP content
            if (cardAccumulator && result && typeof result === 'object' && result._card) {
              cardAccumulator.capture(result._card);
            }

            // Unwrap MCP content format if the tool returns it
            if (result && typeof result === 'object' && Array.isArray(result.content)) {
              const textContent = result.content.find((c: any) => c.type === 'text');
              if (textContent) {
                try {
                  return JSON.parse(textContent.text);
                } catch {
                  return textContent.text;
                }
              }
            }

            return result;
          };

          return takeCitations(await callTool(), evidence);
        },
      };
    }

    return tools;
  }

  /**
   * Route a single tool invocation through InvocationPipelineService (unified
   * scope + HITL + audit pipeline). Returns the AI-SDK-compatible unwrapped
   * result, or `undefined` if the pipeline isn't wired in (Mastra boot-order
   * edge case) or threw PipelineError.
   */
  private async runViaPipeline(
    toolName: string,
    args: Record<string, unknown>,
    context: McpToolInvocationContext,
    userMode: string,
    cardAccumulator?: CardAccumulator,
  ): Promise<unknown> {
    if (!this.pipeline) return undefined;

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
      if (err instanceof PipelineError) return undefined;
      throw err;
    }
  }

  /**
   * Build a ToolSet containing exactly the tools named in `toolNames`.
   *
   * Used by the Desk (non-chat invocation): the engine hands over an
   * explicit allowlist from `responsibility.policy.<beat>.tools`. Tools not
   * on the list are not included — no persona lookup. `confirm-action` is
   * NOT auto-added; Desk runs with HITL bypass (the episode-level approval
   * is the only HITL).
   */
  async getToolsForNames(
    toolNames: string[],
    context?: {
      tenantId: number;
      // `userId` here is the attribution string (JWT sub OR a synthetic
      // `desk-scheduler`/`event:unknown` for non-user-initiated runs), not
      // a DB id. See `deriveTriggeredBy` in desk-engine.service.ts.
      userId: string;
      // `userDbId` is only meaningful when the trigger is a real user
      // (e.g. `triggeredBy = 'user:42'`). For scheduler/event triggers the
      // caller passes null. When Desk joins the pipeline (Phase F) the
      // principal factory will reject null and the caller will need to
      // resolve or pass a system user.
      userDbId: number | null;
      conversationId?: string;
      invocationSource?: 'desk' | 'chat';
    },
    cardAccumulator?: CardAccumulator,
  ): Promise<ToolSet> {
    if (this.allTools.size === 0) {
      this.discoverTools();
    }

    const tools: ToolSet = {};

    for (const toolName of toolNames) {
      const registeredTool = this.allTools.get(toolName);
      if (!registeredTool) continue;

      const { providerClass, methodName, metadata } = registeredTool;

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
          const injectedArgs = context
            ? {
                ...args,
                _tenantId: context.tenantId,
                _userId: context.userId,
                _conversationId: context.conversationId,
                _invocationSource: context.invocationSource ?? 'desk',
              }
            : args;

          const callTool = async () => {
            const instance = this.moduleRef.get(providerClass, {
              strict: false,
            });
            const result = await instance[methodName](injectedArgs);

            if (cardAccumulator && result && typeof result === 'object' && result._card) {
              cardAccumulator.capture(result._card);
            }

            if (result && typeof result === 'object' && Array.isArray(result.content)) {
              const textContent = result.content.find((c: any) => c.type === 'text');
              if (textContent) {
                try {
                  return JSON.parse(textContent.text);
                } catch {
                  return textContent.text;
                }
              }
            }

            return result;
          };

          return takeCitations(await callTool());
        },
      };
    }

    return tools;
  }

  /**
   * Lookup metadata for a single tool by name. Returns `null` when the tool
   * hasn't been discovered yet (registry cold) or doesn't exist. Callers
   * outside the MCP subsystem (e.g. the Desk agent-detail) use this to
   * surface tool descriptions and classify read/write intent without going
   * through the per-persona toolset path.
   */
  getToolMetadata(toolName: string): { description: string; kind: 'read' | 'write' } | null {
    const registered = this.allTools.get(toolName);
    if (!registered) return null;
    return {
      description: registered.metadata?.description ?? '',
      kind: McpToolService.WRITE_TOOLS.has(toolName) ? 'write' : 'read',
    };
  }

  /**
   * All write-class tools currently known to the registry. Read-only tools
   * are excluded — callers wanting them can enumerate via `allTools` once
   * exposed, which isn't needed today.
   */
  getAllWriteTools(): string[] {
    return Array.from(McpToolService.WRITE_TOOLS).sort();
  }

  /**
   * Write tools that require HITL confirmation before execution.
   *
   * Empty in the starter — register write-class tool names here as you add
   * `@Tool` providers that mutate state, so the assistant prompts the user
   * with `confirm-action` before invoking them.
   */
  private static readonly WRITE_TOOLS = new Set<string>([]);

  /**
   * Get tools in Mastra's `toolsets` format for dynamic injection.
   *
   * Returns `{ 'app-tools': { ...mcpTools, 'confirm-action': ... } }`
   * which is passed to `agent.stream()` / `agent.generate()` via `toolsets`.
   *
   * Includes confirm-action tool for personas with write tools.
   */
  async getToolsetsForPersona(
    userMode: string,
    context?: McpToolInvocationContext,
    cardAccumulator?: CardAccumulator,
    evidence?: TurnEvidence,
  ): Promise<Record<string, ToolSet>> {
    const tools = await this.getToolsForPersona(userMode, context, cardAccumulator, evidence);

    // Include confirm-action tool if any exposed tool is write-class.
    const hasWriteTools = Object.keys(tools).some((t) => McpToolService.WRITE_TOOLS.has(t));
    if (hasWriteTools) {
      (tools as any)['confirm-action'] = confirmActionTool;
    }

    return { 'app-tools': tools };
  }
}

/**
 * Move a tool result's `_citations` side channel into the turn's evidence and strip it, so the model never sees it.
 * With no evidence collecting (a delegated execute, a Desk run) the key is still stripped.
 */
export function takeCitations(result: unknown, evidence?: TurnEvidence): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result) || !(CITATIONS_SIDE_CHANNEL in result)) {
    return result;
  }
  const { [CITATIONS_SIDE_CHANNEL]: offered, ...rest } = result as Record<string, unknown>;
  if (evidence && Array.isArray(offered)) evidence.offer(offered);
  return rest;
}
