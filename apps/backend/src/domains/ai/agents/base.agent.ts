import { Logger } from '@nestjs/common';
import { AiInvocationStatus, AiSurface } from '@appshore/db';
import { RequestContext } from '@mastra/core/request-context';

import { CardAccumulator, McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { AiRouteResolver } from '../routing/ai-route-resolver.service';
import { REQUEST_MODEL_KEY } from '../routing/request-model-key';
import type { ResolvedRoute } from '../routing/routing.types';
import { OUTPUT_CEILINGS } from '../routing/output-ceilings';
import { AI_LINK_REF_TYPES } from '../infrastructure/telemetry/ai-telemetry.constants';
import { buildLangfuseSession } from '../infrastructure/telemetry/langfuse-session';
import { PromptingService } from '../../prompting';
import {
  AgentContext,
  AgentDefinition,
  AgentResult,
  AgentStatus,
  ChatChunk,
  AssistantAgentContract,
} from './agent.types';

/**
 * The output ceiling of each step of an agent run (a chat turn or a delegated execute): tool calls and notes, or one
 * answer. Mastra applies it per model call, so a multi-step turn is bounded per step, never by the provider's whole
 * output window.
 */
export const CHAT_STEP_MAX_OUTPUT_TOKENS = OUTPUT_CEILINGS.STEP;

export abstract class AbstractBaseAgent implements AssistantAgentContract {
  protected readonly logger: Logger;

  abstract readonly definition: AgentDefinition;

  get id() {
    return this.definition.id;
  }
  get displayName() {
    return this.definition.displayName;
  }
  get mastraAgentId() {
    return this.definition.mastraAgentId;
  }
  get modelAlias() {
    return this.definition.modelAlias;
  }
  get domainSkills() {
    return this.definition.domainSkills;
  }
  get taskSkills() {
    return this.definition.taskSkills;
  }
  get personas() {
    return this.definition.personas;
  }

  constructor(
    protected readonly skillLoader: PromptingService,
    protected readonly mcpToolService: McpToolService,
    protected readonly mastraProvider: MastraProvider,
    protected readonly aiTelemetry: AiTelemetryService,
    protected readonly aiRouteResolver: AiRouteResolver,
  ) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * The tenant's route and the request context that hands its model to the Mastra agent. Resolved before anything
   * streams, so a retention or configuration refusal is a clean typed error, never a mid-stream failure.
   */
  private async resolveModel(tenantId: number) {
    const route = await this.aiRouteResolver.resolve(tenantId, 'language');
    const requestContext = new RequestContext([[REQUEST_MODEL_KEY, route.languageModel(this.definition.modelAlias)]]);
    return { route, requestContext };
  }

  /**
   * Chat mode — user is talking to this agent. Streams response chunks.
   *
   * AI cost telemetry: Mastra's stream response exposes `usage` once the
   * stream drains. After yielding all chunks we read it and record one
   * `AiInvocation` row (surface APP_CHAT). If the client disconnects
   * mid-stream the generator is abandoned and usage may be unavailable —
   * `recordChatUsage` records a partial/ERROR row in that case rather than
   * losing the cost entirely. Recording never throws into the chat path.
   */
  async *chat(message: string, ctx: AgentContext): AsyncGenerator<ChatChunk> {
    const { route, requestContext } = await this.resolveModel(ctx.tenantId);
    const agent = this.mastraProvider.getMastra().getAgent(this.mastraAgentId);
    const cardAccumulator = new CardAccumulator();
    const toolsets = await this.mcpToolService.getToolsetsForPersona(
      ctx.userMode,
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userDbId: ctx.userDbId,
        conversationId: ctx.conversationId,
      },
      cardAccumulator,
    );
    const domainSkillContent = await this.skillLoader.getSkills(this.domainSkills);
    const instructions = await this.buildChatInstructions(agent, ctx, domainSkillContent);

    // Group this chat turn's Langfuse trace under the conversation session so
    // the AI Spend deep-link resolves. Same session shape as the cost ledger.
    const { sessionId, userId, tags } = buildLangfuseSession({
      tenantId: ctx.tenantId,
      surface: AiSurface.CHAT,
      agentId: this.mastraAgentId,
      linkRefType: AI_LINK_REF_TYPES.CONVERSATION_MESSAGE,
      linkRefId: ctx.conversationId,
    });

    const startedAt = Date.now();
    const response = await agent.stream(message, {
      instructions,
      toolsets,
      memory: {
        thread: ctx.conversationId,
        resource: `tenant-${ctx.tenantId}-user-${ctx.userId}`,
      },
      maxSteps: this.definition.maxToolSteps,
      modelSettings: { maxOutputTokens: CHAT_STEP_MAX_OUTPUT_TOKENS },
      requestContext,
      tracingOptions: { metadata: { sessionId, userId }, tags },
    });

    let streamErrored = false;
    try {
      yield* this.streamTextChunks(response, ctx.conversationId);
    } catch (err) {
      streamErrored = true;
      throw err;
    } finally {
      // Record cost telemetry whether the stream finished or the client
      // disconnected mid-way. Fire-and-forget; never blocks or throws into
      // the chat path.
      void this.recordChatUsage(response, ctx, Date.now() - startedAt, streamErrored, route);
    }

    if (cardAccumulator.card) {
      yield {
        type: 'card' as const,
        data: JSON.stringify(cardAccumulator.card),
      };
    }

    const suspendChunk = await this.extractSuspendChunk(response);
    if (suspendChunk) yield suspendChunk;
  }

  private async buildChatInstructions(
    // Mastra's Agent type for getInstructions varies by version; treat loosely.
    agent: { getInstructions: (...args: any[]) => unknown },
    ctx: AgentContext,
    domainSkillContent: string,
  ): Promise<string> {
    const rawInstructions = await Promise.resolve(agent.getInstructions());
    const parts: string[] = [
      typeof rawInstructions === 'string' ? rawInstructions : '',
      `You are assisting a ${ctx.userMode}.`,
    ];
    if (domainSkillContent) {
      parts.push(`## Domain Knowledge\n\n${domainSkillContent}`);
    }
    if (ctx.taskSkillContent) {
      parts.push(`## Task Procedure\n\n${ctx.taskSkillContent}`);
    }
    if (ctx.voiceInstructions) {
      parts.push(ctx.voiceInstructions);
    }
    return parts.filter(Boolean).join('\n\n');
  }

  private async *streamTextChunks(response: any, conversationId: string): AsyncGenerator<ChatChunk> {
    const reader = response.textStream.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield { type: 'text-delta' as const, data: value };
      }
    } catch (streamError) {
      this.logger.warn(`Stream error for ${conversationId}`, streamError);
    } finally {
      reader.releaseLock();
    }
  }

  private async extractSuspendChunk(response: any): Promise<ChatChunk | null> {
    try {
      const suspendPayload = await Promise.resolve(response.suspendPayload);
      if (!suspendPayload) return null;
      const payload =
        typeof suspendPayload === 'object' && suspendPayload !== null
          ? { ...suspendPayload, runId: response.runId }
          : { data: suspendPayload, runId: response.runId };
      return { type: 'suspend' as const, data: JSON.stringify(payload) };
    } catch {
      return null;
    }
  }

  /**
   * Record one AiInvocation for a chat turn from the drained stream's usage.
   * The turn ran on `route` with the agent's `definition.modelAlias`, so cost
   * is attributed to that route and that alias's id on it. Usage is read
   * defensively (await the promise, tolerate missing keys / mid-stream
   * disconnect). Never throws into the chat path.
   */
  private async recordChatUsage(
    response: any,
    ctx: AgentContext,
    latencyMs: number,
    streamErrored: boolean,
    route: ResolvedRoute,
  ): Promise<void> {
    try {
      const usage = (await Promise.resolve(response?.usage).catch(() => undefined)) as
        | Record<string, unknown>
        | undefined;
      const promptTokens = numberOrZero(usage?.promptTokens ?? usage?.inputTokens);
      const completionTokens = numberOrZero(usage?.completionTokens ?? usage?.outputTokens);
      const cachedTokens = optionalNumber(
        usage?.cachedPromptTokens ?? usage?.cacheReadInputTokens ?? usage?.promptTokensCached,
      );

      const alias = this.definition.modelAlias;
      await this.aiTelemetry.record(
        {
          provider: route.providerLabel,
          model: route.ledgerModelIdFor(alias),
          routeId: route.routeId,
          credentialType: route.credentialType,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cachedTokens,
          latencyMs,
          status: streamErrored ? AiInvocationStatus.ERROR : AiInvocationStatus.OK,
        },
        {
          tenantId: ctx.tenantId,
          userId: ctx.userDbId ?? undefined,
          surface: AiSurface.CHAT,
          agentId: this.mastraAgentId,
          linkRefType: AI_LINK_REF_TYPES.CONVERSATION_MESSAGE,
          linkRefId: ctx.conversationId,
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Chat usage telemetry failed (non-blocking): ${msg}`);
    }
  }

  /**
   * Service mode — another agent delegates READ-ONLY work here.
   * Returns structured result, not a stream.
   */
  async execute(action: string, params: Record<string, unknown>, ctx: AgentContext): Promise<AgentResult> {
    const { requestContext } = await this.resolveModel(ctx.tenantId);
    const agent = this.mastraProvider.getMastra().getAgent(this.mastraAgentId);

    const skillContent = await this.skillLoader.getSkill(action);
    const domainContent = await this.skillLoader.getSkills(this.domainSkills);

    // Build READ-ONLY toolset — remove confirm-action so sub-agents can't trigger HITL
    const toolsets = await this.mcpToolService.getToolsetsForPersona(ctx.userMode, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      userDbId: ctx.userDbId,
      conversationId: ctx.conversationId,
    });
    if (toolsets['app-tools']) {
      delete toolsets['app-tools']['confirm-action'];
    }

    const { sessionId, userId, tags } = buildLangfuseSession({
      tenantId: ctx.tenantId,
      surface: AiSurface.CHAT,
      agentId: this.mastraAgentId,
      linkRefType: AI_LINK_REF_TYPES.CONVERSATION_MESSAGE,
      linkRefId: ctx.conversationId,
    });

    const result = await agent.generate(
      `Execute: ${action}\nParameters: ${JSON.stringify(params)}\nFollow the procedure exactly. Return a clear, structured answer.`,
      {
        instructions: [domainContent, skillContent].filter(Boolean).join('\n\n'),
        toolsets,
        maxSteps: 3,
        modelSettings: { maxOutputTokens: CHAT_STEP_MAX_OUTPUT_TOKENS },
        requestContext,
        tracingOptions: { metadata: { sessionId, userId }, tags },
      },
    );

    return { text: result.text, structured: {} };
  }

  /**
   * Canvas status — override in each agent with domain-specific query.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- default stub, overridden by specific agents
  async getStatus(_tenantId: number): Promise<AgentStatus> {
    return { state: 'idle', summary: 'Ready' };
  }
}

function numberOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function optionalNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
