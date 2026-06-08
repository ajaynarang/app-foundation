import { Logger } from '@nestjs/common';
import { AiInvocationStatus, AiSurface } from '@prisma/client';

import { CardAccumulator, McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { MODEL_ID_BY_ALIAS, PROVIDER_BY_ALIAS } from '../infrastructure/providers/ai-provider';
import { AI_LINK_REF_TYPES } from '../infrastructure/telemetry/ai-telemetry.constants';
import { buildLangfuseSession } from '../infrastructure/telemetry/langfuse-session';
import { PromptingService } from '../../../domains/prompting';
import { AgentContext, AgentDefinition, AgentResult, AgentStatus, ChatChunk, SallyAgent } from './agent.types';

export abstract class AbstractBaseAgent implements SallyAgent {
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
  ) {
    this.logger = new Logger(this.constructor.name);
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
      void this.recordChatUsage(response, ctx, Date.now() - startedAt, streamErrored);
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
   * The chat agents are registered with their definition.modelAlias in
   * MastraProvider, so we attribute cost to that tier. Usage is read
   * defensively (await the promise, tolerate missing keys / mid-stream
   * disconnect). Never throws into the chat path.
   */
  private async recordChatUsage(
    response: any,
    ctx: AgentContext,
    latencyMs: number,
    streamErrored: boolean,
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
          provider: PROVIDER_BY_ALIAS[alias],
          model: MODEL_ID_BY_ALIAS[alias],
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
