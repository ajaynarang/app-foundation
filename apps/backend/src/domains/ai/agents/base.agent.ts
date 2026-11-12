import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AiInvocationStatus, AiSurface } from '@appshore/db';
import { RequestContext } from '@mastra/core/request-context';

import { CardAccumulator, McpToolService } from '../mcp/mcp-tool.service';
import { TurnEvidence } from '../mcp/turn-evidence';
import { parseFollowups } from '../assistant/utils/parse-followups';
import { MastraProvider } from '../assistant/mastra/mastra.provider';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { AiRouteResolver } from '../routing/ai-route-resolver.service';
import { REQUEST_MODEL_KEY } from '../routing/request-model-key';
import type { ResolvedRoute } from '../routing/routing.types';
import { OUTPUT_CEILINGS } from '../routing/output-ceilings';
import { AI_LINK_REF_TYPES } from '../infrastructure/telemetry/ai-telemetry.constants';
import { buildLangfuseSession } from '../infrastructure/telemetry/langfuse-session';
import { captureUsageShape, usageFromAiSdk } from '../infrastructure/telemetry/usage-from-ai-sdk';
import { mapProviderRefusal } from '../infrastructure/telemetry/ai-provider-credit-refused.error';
import { readStreamError } from './read-stream-error';
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
    /** Reads the local usage-capture switch (`aiUsageCaptureDir`); optional, so a test can leave it out. */
    protected readonly config?: ConfigService,
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
    const evidence = new TurnEvidence();
    const toolsets = await this.mcpToolService.getToolsetsForPersona(
      ctx.userMode,
      {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        userDbId: ctx.userDbId,
        conversationId: ctx.conversationId,
      },
      cardAccumulator,
      evidence,
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
    let response: any;
    try {
      response = await agent.stream(message, {
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
    } catch (err) {
      // A provider's credit refusal is the budget error the chat already answers; anything else is unchanged.
      throw mapProviderRefusal(err, ctx.tenantId, route);
    }

    let streamErrored = false;
    let answer = '';
    try {
      answer = yield* this.streamTextChunks(response, ctx, route, evidence);
    } catch (err) {
      streamErrored = true;
      throw err;
    } finally {
      // Record cost telemetry whether the stream finished or the client
      // disconnected mid-way. Fire-and-forget; never blocks or throws into
      // the chat path.
      void this.recordChatUsage(response, ctx, Date.now() - startedAt, streamErrored, route);
    }

    // The sources the answer named, among those its tools read. A follow-up suggestion that names a title is not one.
    const { cleanText } = parseFollowups(answer);
    for (const citation of evidence.citedIn(cleanText)) {
      yield { type: 'citation' as const, data: JSON.stringify(citation) };
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

  /**
   * The answer's text as it streams, with a `reading` chunk whenever a tool offers a new source mid-turn. One pending
   * read is carried across iterations, so racing the two never drops a text chunk. Returns the whole answer.
   *
   * A stream that fails, whether the read threw or Mastra recorded the error on the response (`response.error`), is
   * thrown, so the chat route can end the turn with a terminal error frame instead of ending it blank. A provider credit
   * refusal is thrown as `AiProviderCreditRefused` (a budget error), so the turn fails the way a capped workspace's does.
   */
  private async *streamTextChunks(
    response: any,
    ctx: AgentContext,
    route: ResolvedRoute,
    evidence: TurnEvidence,
  ): AsyncGenerator<ChatChunk, string> {
    const reader = response.textStream.getReader();
    let answer = '';
    let failure: unknown;
    let pendingRead: Promise<{ kind: 'text'; result: ReadableStreamReadResult<string> }> | null = null;
    try {
      while (true) {
        pendingRead ??= reader.read().then((result: ReadableStreamReadResult<string>) => ({
          kind: 'text' as const,
          result,
        }));
        const next = await Promise.race([
          pendingRead,
          evidence.waitForReading().then(() => ({ kind: 'reading' as const })),
        ]);
        if (next.kind === 'reading') {
          yield* readingChunks(evidence);
          continue;
        }
        pendingRead = null;
        if (next.result.done) break;
        answer += next.result.value;
        yield { type: 'text-delta' as const, data: next.result.value };
      }
      yield* readingChunks(evidence);
    } catch (streamError) {
      failure = streamError;
      this.logger.warn(`Stream error for ${ctx.conversationId}`, streamError);
    } finally {
      // Releasing with a read in flight rejects it (an early client disconnect); nothing awaits it any more, so
      // observe the rejection to keep it quiet.
      pendingRead?.catch(() => undefined);
      reader.releaseLock();
    }
    const error = failure ?? readStreamError(response);
    if (error) throw mapProviderRefusal(error, ctx.tenantId, route);
    return answer;
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
      // The run's total over every step (Mastra's `totalUsage`, else `usage`), plus the per-step provider metadata
      // that carries the cache counts some routes report nowhere else.
      const settle = (value: unknown) => Promise.resolve(value).catch(() => undefined);
      const [totalUsage, usage, providerMetadata, steps] = await Promise.all([
        settle(response?.totalUsage),
        settle(response?.usage),
        settle(response?.providerMetadata),
        settle(response?.steps),
      ]);
      const result = { usage: totalUsage ?? usage, providerMetadata, steps };
      captureUsageShape(this.mastraAgentId, result, this.config?.get<string>('aiUsageCaptureDir'));
      const { promptTokens, completionTokens, cachedTokens, cacheWriteTokens } = usageFromAiSdk(result);

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
          cacheWriteTokens,
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

/** The reading frames queued since the last drain, as chunks. */
function* readingChunks(evidence: TurnEvidence): Generator<ChatChunk> {
  for (const frame of evidence.drainReading()) {
    yield { type: 'reading' as const, data: JSON.stringify(frame) };
  }
}
