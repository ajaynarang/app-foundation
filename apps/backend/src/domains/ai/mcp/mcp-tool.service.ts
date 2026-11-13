import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { jsonSchema, type ToolSet } from 'ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { SCOPE_TIERS, scopeTier } from '@app/shared-types';
import {
  createConfirmActionTool,
  describeIntent,
  type ConfirmIntentRecorder,
} from '../assistant/mastra/tools/confirm-action.tool';
import { InvocationPipelineService } from '../agent-contract/invocation-pipeline.service';
import { HitlChallengeService } from '../agent-contract/hitl-challenge.service';
import { ToolAvailabilityService } from '../agent-contract/tool-availability.service';
import { getRequiredScope } from '../agent-contract/requires-scope.decorator';
import { intentDigest, prepareIntentArgs } from '../agent-contract/intent-digest';
import { fromUser, type UserPrincipal } from '@appshore/platform/auth/agent-principal';
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

/** One confirm card in one conversation: what the resume route confirms or cancels. */
export interface ChatCardInput {
  tenantId: number;
  userDbId: number;
  conversationId: string;
  /** The suspended confirm-action call (from the `9:` frame). */
  toolCallId: string;
}

/** Options for a toolset. `readOnly` (a delegated sub-agent) leaves out every write and confirm-action. */
export interface ToolsetOptions {
  readOnly?: boolean;
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
    @Optional() private readonly challenges?: HitlChallengeService,
    @Optional() private readonly toolAvailability?: ToolAvailabilityService,
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
   * pipeline, whose executor injects the session identity (`_tenantId`, `_userId`, `_userDbId`, `_role`,
   * `_conversationId`); the pipeline drops every `_` key the model sends, so the model never controls them. Tenant
   * isolation is each tool's own `_tenantId` filter; no transaction or role switch is opened around a tool call. A
   * write runs only against the person's confirmation of that exact call in this conversation.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Promise<ToolSet> is part of the public API contract
  async getToolsForPersona(
    userMode: string,
    context: McpToolInvocationContext,
    cardAccumulator?: CardAccumulator,
    evidence?: TurnEvidence,
    options: ToolsetOptions = {},
  ): Promise<ToolSet> {
    if (this.allTools.size === 0) {
      this.discoverTools();
    }

    const tools: ToolSet = {};

    for (const toolName of this.allTools.keys()) {
      const registeredTool = this.allTools.get(toolName);
      if (!registeredTool) continue;
      // A tool whose channel is not configured is never offered, so the model cannot promise it.
      if (!this.isAvailable(toolName)) continue;
      // A delegated sub-agent gets reads only, so it can neither raise a card nor spend the person's confirmation.
      if (options.readOnly && this.isWriteTool(toolName)) continue;

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

    const principal = chatPrincipal(userMode, context);

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

  /** False when `ToolAvailabilityService` withholds the tool. Without the service every tool is available. */
  private isAvailable(toolName: string): boolean {
    return this.toolAvailability?.isAvailable(toolName) ?? true;
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
   * `confirm-action` is offered when the toolset holds a write. It is built for this request: it records the exact
   * write it proposes for this person in this conversation. A read-only toolset never offers it.
   */
  async getToolsetsForPersona(
    userMode: string,
    context: McpToolInvocationContext,
    cardAccumulator?: CardAccumulator,
    evidence?: TurnEvidence,
    options: ToolsetOptions = {},
  ): Promise<Record<string, ToolSet>> {
    const tools = await this.getToolsForPersona(userMode, context, cardAccumulator, evidence, options);

    const hasWriteTools = Object.keys(tools).some((t) => this.isWriteTool(t));
    if (hasWriteTools && !options.readOnly) {
      (tools as any)['confirm-action'] = createConfirmActionTool(this.intentRecorder(userMode, context));
    }

    return { 'app-tools': tools };
  }

  /** The person pressed Confirm on this card. True once; false when it is no longer waiting. */
  async confirmChatCard(input: ChatCardInput): Promise<boolean> {
    if (!this.challenges) return false;
    return this.challenges.confirmChatIntent(chatCardKey(input));
  }

  /** The person pressed Cancel on this card. */
  async declineChatCard(input: ChatCardInput): Promise<void> {
    await this.challenges?.declineChatIntent(chatCardKey(input));
  }

  /**
   * Void this conversation's confirmed but unspent grants (the end of a resumed turn) and, with `includePending`,
   * the cards still waiting for a decision (a new user message).
   */
  async revokeChatGrants(input: Omit<ChatCardInput, 'toolCallId'> & { includePending?: boolean }): Promise<void> {
    await this.challenges?.revokeChatGrants({
      tenantId: input.tenantId,
      userId: input.userDbId,
      conversationId: input.conversationId,
      ...(input.includePending && { includePending: true }),
    });
  }

  /**
   * Records the write a confirm card proposes and builds the card from it. Only a write tool this person could run
   * here (the pipeline's steps 1 to 4 pass), with arguments the tool accepts, can be proposed, so nobody is asked to
   * confirm a change the pipeline would refuse.
   */
  private intentRecorder(userMode: string, context: McpToolInvocationContext): ConfirmIntentRecorder {
    return async ({ tool, args, toolCallId }) => {
      if (!context.conversationId || !this.challenges || !this.pipeline) {
        return { ok: false, error: 'Confirmation is not available in this session.' };
      }
      const registered = this.allTools.get(tool);
      if (!registered || !this.isWriteTool(tool) || !this.isAvailable(tool)) {
        return {
          ok: false,
          error: `"${tool}" is not a change you can ask the person to confirm. Name the write tool you will call.`,
        };
      }
      const schema = registered.metadata?.parameters;
      const prepared = prepareIntentArgs(schema, args);
      if ('error' in prepared) {
        return { ok: false, error: `Those arguments are not valid for ${tool}: ${prepared.error}` };
      }
      const refusal = await this.pipeline.preflight(chatPrincipal(userMode, context), tool, args);
      if (refusal) {
        return { ok: false, error: refusal.content.find((c) => c.type === 'text')?.text ?? 'This cannot run here.' };
      }

      await this.challenges.recordChatIntent({
        tenantId: context.tenantId,
        userId: context.userDbId,
        conversationId: context.conversationId,
        toolCallId,
        toolName: tool,
        argsDigest: intentDigest(schema, args),
        scopeRequired: getRequiredScope(registered.providerClass.prototype, registered.methodName) ?? '',
      });

      const { action, description } = describeIntent(tool, prepared.data);
      return { ok: true, card: { action, description, tool, args: prepared.data, toolCallId } };
    };
  }
}

/**
 * The principal a chat tool call runs as. `role` here only selects the persona's scope set: the pipeline caps it at
 * the scopes of the person's current role in this workspace and checks `@RestrictToRoles` against that role, so a
 * persona never widens access. The conversation binds every confirmation to this chat.
 */
function chatPrincipal(userMode: string, context: McpToolInvocationContext): UserPrincipal {
  const role = userMode.toUpperCase();
  return fromUser({
    userId: context.userDbId,
    tenantId: context.tenantId,
    role,
    scopes: scopesForRole(role),
    conversationId: context.conversationId,
  });
}

function chatCardKey(input: ChatCardInput) {
  return {
    tenantId: input.tenantId,
    userId: input.userDbId,
    conversationId: input.conversationId,
    toolCallId: input.toolCallId,
  };
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
