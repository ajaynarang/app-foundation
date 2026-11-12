import { HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@mastra/core/request-context';
import {
  CitationSchema,
  MAX_ACTIVE_CONVERSATIONS,
  MAX_CITATIONS_PER_MESSAGE,
  STREAM_FRAME,
  type Citation,
} from '@app/shared-types';
import { writeErrorEnvelope } from '@appshore/platform/shared/filters/error-envelope';
import { invalidState } from '@appshore/kernel/shared/errors/api-errors';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { DOMAIN_EVENTS } from '../../../platform-glue/events/domain-events.constants';
import { generateId } from '@appshore/kernel/shared/utils/id-generator';
import { CardAccumulator, McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from './mastra/mastra.provider';
import { ModerationService } from '../moderation/moderation.service';
import { PromptingService } from '../../prompting';
import { AssistantRouterService } from '../orchestrator/assistant-router.service';
import { AgentRegistry } from '../agents/agent.registry';
import { CHAT_STEP_MAX_OUTPUT_TOKENS } from '../agents/base.agent';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { AiBudgetExceededError } from '../infrastructure/telemetry/ai-budget-exceeded.error';
import { mapProviderRefusal } from '../infrastructure/telemetry/ai-provider-credit-refused.error';
import { AiRouteResolver } from '../routing/ai-route-resolver.service';
import { AiNotConfigured } from '../routing/ai-not-configured.error';
import { CredentialCryptoService } from '../routing/credential-crypto.service';
import {
  type AiKeysViewer,
  aiKeysViewer,
  budgetReachedChatCopy,
  notConfiguredChatCopy,
} from '../routing/connect/connect-key-copy';
import { REQUEST_MODEL_KEY } from '../routing/request-model-key';
import { UserMode } from '../agents/agent.types';
import type { AgentContext, ChatChunk } from '../agents/agent.types';
import type { Request, Response } from 'express';
import { pipeAgentResponse } from './utils/pipe-agent-response';
import { parseFollowups } from './utils/parse-followups';
import { endStreamWithError } from './utils/end-stream-with-error';

/** Appended to agent instructions when the turn arrives over the voice channel. */
const VOICE_MODE_INSTRUCTIONS =
  'You are responding over voice. Keep replies short, conversational, and easy to speak aloud. ' +
  'Avoid markdown, lists, and long enumerations.';

@Injectable()
export class AssistantAiService {
  private readonly logger = new Logger(AssistantAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpToolService: McpToolService,
    private readonly mastra: MastraProvider,
    private readonly moderationService: ModerationService,
    private readonly promptService: PromptingService,
    private readonly assistantRouter: AssistantRouterService,
    private readonly agentRegistry: AgentRegistry,
    private readonly aiTelemetry: AiTelemetryService,
    private readonly aiRouteResolver: AiRouteResolver,
    private readonly credentialCrypto: CredentialCryptoService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Who is reading a refusal, for the connect-your-key copy: whether they own this workspace and whether the
   * deployment allows workspace keys. Read only when a refusal is about to be written.
   */
  private async keysViewer(userDbId: number, tenantId: number): Promise<AiKeysViewer> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_tenantId: { userId: userDbId, tenantId } },
      select: { role: true },
    });
    return aiKeysViewer(membership?.role, this.credentialCrypto.isConfigured());
  }

  /**
   * A typed refusal (a routing error such as `AiNotConfigured` or `ZeroRetentionUnavailable`, a 404) keeps its own
   * status and body; anything else is answered with `fallback`, so no internal message leaves.
   */
  private static asHttpError(error: unknown, fallback: string): HttpException {
    return error instanceof HttpException ? error : new InternalServerErrorException(fallback);
  }

  private async getUserDbId(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.id;
  }

  /**
   * Validate that the conversation exists, belongs to the given user/tenant and is not archived.
   * Returns the conversation record or sends an error JSON response.
   */
  private async validateConversationOwnership(
    conversationId: string,
    userId: string,
    tenantId: number,
    req: Request,
    res: Response,
  ): Promise<{
    id: number;
    conversationId: string;
    userMode: string;
    title: string | null;
  } | null> {
    try {
      const userDbId = await this.getUserDbId(userId);

      return activeConversation(
        ownedConversation(await this.prisma.conversation.findUnique({ where: { conversationId } }), userDbId, tenantId),
      );
    } catch (error) {
      // This route writes its own response, so the global filter never sees the throw: answer with the same
      // envelope (which also logs it).
      writeErrorEnvelope(res, req, error);
      return null;
    }
  }

  async createConversation(userId: string, tenantId: number, userMode: string) {
    const userDbId = await this.getUserDbId(userId);

    // Opening the assistant creates a conversation eagerly. Reuse this person's newest one that nobody has spoken in
    // yet, so repeated opens do not pile up greeting-only rows (which would also push real ones past the cap).
    const untouched = await this.prisma.conversation.findFirst({
      where: { userId: userDbId, tenantId, userMode, isActive: true, messages: { none: { role: 'user' } } },
      orderBy: { createdAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (untouched && untouched.messages.length > 0) {
      const greeting = untouched.messages[0];
      return {
        conversationId: untouched.conversationId,
        userMode: untouched.userMode,
        createdAt: untouched.createdAt.toISOString(),
        greeting: {
          messageId: greeting.messageId,
          role: greeting.role,
          content: greeting.content,
          inputMode: greeting.inputMode,
          speakText: greeting.speakText ?? undefined,
          createdAt: greeting.createdAt.toISOString(),
        },
      };
    }

    const conversationId = generateId('conv');
    const greetingMessageId = generateId('msg');

    const greetingText = "Hi! I'm your assistant. How can I help you today?";

    const conversation = await this.prisma.conversation.create({
      data: {
        conversationId,
        tenantId,
        userId: userDbId,
        userMode,
        messages: {
          create: {
            messageId: greetingMessageId,
            role: 'assistant',
            content: greetingText,
            inputMode: 'text',
            speakText: greetingText,
          },
        },
      },
      include: { messages: true },
    });

    const greeting = conversation.messages[0];

    // The rolling cap: a failure here is logged and never fails the create (the next create converges).
    await this.enforceConversationCap(userDbId, tenantId).catch((err: unknown) =>
      this.logger.warn(`Conversation cap enforcement failed: ${err instanceof Error ? err.message : 'unknown error'}`),
    );

    return {
      conversationId: conversation.conversationId,
      userMode: conversation.userMode,
      createdAt: conversation.createdAt.toISOString(),
      greeting: {
        messageId: greeting.messageId,
        role: greeting.role,
        content: greeting.content,
        inputMode: greeting.inputMode,
        speakText: greeting.speakText,
        createdAt: greeting.createdAt.toISOString(),
      },
    };
  }

  /**
   * Transport-agnostic LLM pipeline. Both HTTP streaming (streamMessage)
   * and voice agent worker consume this same generator.
   *
   * Validates conversation, stores user message, runs moderation + audit,
   * streams from Mastra agent, persists assistant message, and yields
   * chunks as they arrive.
   */
  async *generateResponse(
    conversationId: string,
    content: string,
    inputMode: string,
    userId: string,
    tenantId: number,
  ): AsyncGenerator<ChatChunk> {
    // 1. Validate conversation ownership, and that it is not archived (throws on failure)
    const userDbId = await this.getUserDbId(userId);
    const conversation = activeConversation(
      ownedConversation(await this.prisma.conversation.findUnique({ where: { conversationId } }), userDbId, tenantId),
    );

    // 2. Store user message
    const userMessageId = generateId('msg');
    await this.prisma.conversationMessage.create({
      data: {
        messageId: userMessageId,
        conversation: { connect: { id: conversation.id } },
        role: 'user',
        content,
        inputMode,
      },
    });

    // 3. Auto-set title from first user message
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ...(conversation.title ? {} : { title: content.slice(0, 100) }),
        updatedAt: new Date(),
      },
    });

    // 4. Input moderation — block-on-policy check only. LLM observability
    // (prompt text, tokens, cost, guardrail detail) lives in Langfuse via
    // the Mastra agent path; the old `AiAuditService` duplicated that work
    // into `ai_agent_interactions` / `ai_guardrail_events` tables that were
    // never applied as migrations, so it was silently throwing on every
    // call. Deleted in favour of Langfuse as the single LLM audit surface.
    try {
      const inputResult = await this.moderationService.moderate(content, 'input', conversation.userMode, tenantId);

      if (inputResult.blocked) {
        const blockedText = "I'm not able to help with that. Could you rephrase your question?";
        await this.prisma.conversationMessage.create({
          data: {
            messageId: generateId('msg'),
            conversation: { connect: { id: conversation.id } },
            role: 'assistant',
            content: blockedText,
            inputMode,
          },
        });
        yield { type: 'blocked', data: blockedText };
        return;
      }
    } catch (moderationError) {
      this.logger.warn('Input moderation failed — allowing message through (fail-open)', moderationError);
    }

    // 4b. Resolve the tenant's language route before anything streams. Retention and configuration refusals
    // (ZeroRetentionUnavailable, AiNotConfigured) surface here as clean typed errors, which the HTTP route answers
    // as an error envelope; nothing reaches a provider.
    const chatRoute = await this.aiRouteResolver.resolve(tenantId, 'language').catch(async (error: unknown) => {
      // Nothing serves chat: say who can fix it. Only the owner, on a deployment with workspace keys, gets the link.
      if (error instanceof AiNotConfigured) {
        throw new AiNotConfigured(error.need, notConfiguredChatCopy(await this.keysViewer(userDbId, tenantId)));
      }
      throw error;
    });

    // 4c. AI cost budget — block chat if the tenant is over its hard cap.
    // The cap is a control on PLATFORM money: a workspace whose language route
    // is its own credential is never blocked from spending its own money.
    // assertBudget fails open (allows on its own infra error), so this only
    // throws on a genuine hard breach. We answer assistant-style rather than
    // surfacing a raw 402 mid-stream, and persist it like the moderation
    // block so the conversation history is coherent.
    try {
      if (chatRoute.payer === 'PLATFORM') await this.aiTelemetry.assertBudget(tenantId);
    } catch (budgetError) {
      if (budgetError instanceof AiBudgetExceededError) {
        const budgetText = budgetReachedChatCopy(await this.keysViewer(userDbId, tenantId));
        await this.prisma.conversationMessage.create({
          data: {
            messageId: generateId('msg'),
            conversation: { connect: { id: conversation.id } },
            role: 'assistant',
            content: budgetText,
            inputMode,
          },
        });
        yield { type: 'blocked', data: budgetText };
        return;
      }
      throw budgetError;
    }

    // 5. Route to domain agent
    const routeResult = await this.assistantRouter.route(content, conversation.userMode as UserMode, tenantId);

    // 6. Get domain agent and stream via chat()
    const domainAgent = this.agentRegistry.get(routeResult.agentId);
    const agentStream = domainAgent.chat(content, {
      userMode: conversation.userMode as UserMode,
      tenantId,
      userId,
      userDbId,
      conversationId,
      inputMode: inputMode as 'text' | 'voice',
      taskSkillContent: routeResult.taskSkillContent ?? undefined,
      voiceInstructions: inputMode === 'voice' ? VOICE_MODE_INSTRUCTIONS : undefined,
    } satisfies AgentContext);

    // 7. Yield chunks from domain agent (same protocol as before)
    let assistantText = '';
    let cardData: string | undefined;
    let suspendData: string | undefined;
    const citations: Citation[] = [];

    for await (const chunk of agentStream) {
      switch (chunk.type) {
        case 'text-delta':
          assistantText += chunk.data;
          yield chunk;
          break;
        case 'reading':
          yield chunk;
          break;
        case 'citation': {
          const citation = parseCitation(chunk.data);
          if (citation && citations.length < MAX_CITATIONS_PER_MESSAGE) {
            citations.push(citation);
            yield chunk;
          }
          break;
        }
        case 'card':
          cardData = chunk.data;
          break;
        case 'suspend':
          suspendData = chunk.data;
          break;
      }
    }

    // Parse follow-ups from response text
    const { cleanText, followUps } = parseFollowups(assistantText);
    assistantText = cleanText;

    if (followUps.length > 0) {
      yield { type: 'followups' as const, data: JSON.stringify(followUps) };
    }

    // 10. Card metadata
    if (cardData) {
      yield { type: 'card', data: cardData };
    }

    // 11. HITL suspension
    if (suspendData) {
      yield { type: 'suspend', data: suspendData };
    }

    // 12. Output moderation + persist assistant message
    if (assistantText) {
      let textToStore = assistantText;
      try {
        const outputResult = await this.moderationService.moderate(assistantText, 'output', '');
        if (outputResult.redactedText) {
          textToStore = outputResult.redactedText;
        }
      } catch (moderationError) {
        this.logger.warn('Output moderation failed — storing original text', moderationError);
      }

      try {
        await this.prisma.conversationMessage.create({
          data: {
            messageId: generateId('msg'),
            conversation: { connect: { id: conversation.id } },
            role: 'assistant',
            content: textToStore,
            inputMode,
            ...(cardData && { card: cardData as any }),
            ...(citations.length > 0 && { citations: citations }),
          },
        });
      } catch (persistError) {
        this.logger.error(
          `Failed to persist assistant message for conversation ${conversationId}`,
          persistError instanceof Error ? persistError.stack : String(persistError),
        );
      }
    }

    yield { type: 'complete', data: assistantText };
  }

  /**
   * Resolve a server-side prompt key into rendered text using the
   * client-supplied template variables. Server-side prompt keys let the client
   * trigger a canned prompt (e.g. a summary) without sending the raw text.
   */
  private async resolvePromptKey(
    promptKey: string,
    clientVariables: Record<string, string> | undefined,
    _tenantId: number,
    _userId: string,
  ): Promise<string> {
    const variables: Record<string, string> = { ...(clientVariables ?? {}) };
    return this.promptService.getPrompt(promptKey, variables);
  }

  async streamMessage(
    conversationId: string,
    content: string,
    inputMode: string,
    userId: string,
    tenantId: number,
    req: Request,
    res: Response,
    options?: {
      promptKey?: string;
      promptVariables?: Record<string, string>;
    },
  ) {
    // Server-resolved prompt key overrides any client-supplied content.
    let effectiveContent = content;
    if (options?.promptKey) {
      try {
        effectiveContent = await this.resolvePromptKey(options.promptKey, options.promptVariables, tenantId, userId);
      } catch (err) {
        this.logger.error(
          `Failed to resolve promptKey=${options.promptKey}`,
          err instanceof Error ? err.stack : String(err),
        );
        writeErrorEnvelope(res, req, new InternalServerErrorException('Failed to resolve prompt'));
        return;
      }
    }

    // Set streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    try {
      for await (const chunk of this.generateResponse(conversationId, effectiveContent, inputMode, userId, tenantId)) {
        if (clientDisconnected) break;

        const frame = streamFrameOf(chunk);
        if (frame) res.write(frame);
      }
    } catch (error) {
      // Before the first frame the answer is the error envelope (a routing refusal keeps its own status and code);
      // after it, one terminal `x:` frame with the same code and detail.
      endStreamWithError(
        req,
        res,
        AssistantAiService.asHttpError(error, 'AI streaming failed'),
        this.logger,
        `AI streaming error for conversation ${conversationId}`,
      );
    }

    if (!res.writableEnded) res.end();
  }

  async resumeAgent(
    conversationId: string,
    confirmed: boolean,
    toolCallId: string | undefined,
    runId: string | undefined,
    userId: string,
    tenantId: number,
    req: Request,
    res: Response,
  ) {
    const conversation = await this.validateConversationOwnership(conversationId, userId, tenantId, req, res);
    if (!conversation) return;

    const userDbId = await this.getUserDbId(userId);
    const cardAccumulator = new CardAccumulator();
    const toolsets = await this.mcpToolService.getToolsetsForPersona(
      conversation.userMode,
      { tenantId, userId, userDbId, conversationId },
      cardAccumulator,
    );
    // Resume targets the persona's default agent (the same agent the streaming
    // turn would have defaulted to). The Mastra agent key equals the agent id.
    const agentId = this.assistantRouter.defaultAgentFor(conversation.userMode);
    const agent = this.mastra.getMastra().getAgent(agentId);

    let route: Awaited<ReturnType<AiRouteResolver['resolve']>> | undefined;
    try {
      // Agents take their model per request: the resumed turn runs on the tenant's route like the original did.
      const resolved = await this.aiRouteResolver.resolve(tenantId, 'language');
      route = resolved;
      const modelAlias = this.agentRegistry.get(agentId).modelAlias;
      const requestContext = new RequestContext([[REQUEST_MODEL_KEY, resolved.languageModel(modelAlias)]]);
      const response = await agent.resumeStream(
        { confirmed },
        {
          toolsets,
          memory: {
            thread: conversationId,
            resource: `tenant-${tenantId}-user-${userId}`,
          },
          ...(toolCallId && { toolCallId }),
          ...(runId && { runId }),
          modelSettings: { maxOutputTokens: CHAT_STEP_MAX_OUTPUT_TOKENS },
          requestContext,
        },
      );

      await pipeAgentResponse(response as any, {
        conversationDbId: conversation.id,
        conversationId,
        req,
        res,
        prisma: this.prisma,
        logger: this.logger,
        moderationService: this.moderationService,
        cardAccumulator,
        // A provider credit refusal keeps its own code and copy, as on the chat path.
        mapError: (error) =>
          AssistantAiService.asHttpError(mapProviderRefusal(error, tenantId, resolved), 'Resume failed'),
      });
    } catch (error) {
      endStreamWithError(
        req,
        res,
        AssistantAiService.asHttpError(route ? mapProviderRefusal(error, tenantId, route) : error, 'Resume failed'),
        this.logger,
        `Resume error for conversation ${conversationId}`,
      );
      if (!res.writableEnded) res.end();
    }
  }

  /**
   * Archive this person's active conversations beyond the newest `MAX_ACTIVE_CONVERSATIONS`. Idempotent: a re-run
   * converges on the same state, so someone who already has more than the cap is trimmed on their next new chat.
   */
  private async enforceConversationCap(userDbId: number, tenantId: number): Promise<void> {
    const overflow = await this.prisma.conversation.findMany({
      where: { userId: userDbId, tenantId, isActive: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: MAX_ACTIVE_CONVERSATIONS,
      select: { id: true, conversationId: true },
    });
    if (overflow.length === 0) return;

    await this.outbox.transaction(async (tx, emit) => {
      await tx.conversation.updateMany({
        where: { id: { in: overflow.map((c) => c.id) } },
        data: { isActive: false },
      });
      for (const c of overflow) {
        await emit(DOMAIN_EVENTS.CONVERSATION_ARCHIVED, tenantId, { conversationId: c.conversationId, reason: 'cap' });
      }
    });
  }

  /** Archive one of this person's conversations (`DELETE`). Rows and messages are kept; history stops listing it. */
  async archiveConversation(conversationId: string, userId: string, tenantId: number): Promise<void> {
    const userDbId = await this.getUserDbId(userId);
    const conversation = ownedConversation(
      await this.prisma.conversation.findUnique({ where: { conversationId } }),
      userDbId,
      tenantId,
    );
    if (!conversation.isActive) return;

    await this.outbox.transaction(async (tx, emit) => {
      await tx.conversation.update({ where: { id: conversation.id }, data: { isActive: false } });
      await emit(DOMAIN_EVENTS.CONVERSATION_ARCHIVED, tenantId, { conversationId, reason: 'user' });
    });
  }

  async listConversations(userId: string, tenantId: number, limit: number = MAX_ACTIVE_CONVERSATIONS) {
    const userDbId = await this.getUserDbId(userId);

    const conversations = await this.prisma.conversation.findMany({
      // Active conversations with at least one question: archived ones and greeting-only rows (the assistant was
      // opened, nothing was asked) stay out of history.
      where: { userId: userDbId, tenantId, isActive: true, messages: { some: { role: 'user' } } },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, MAX_ACTIVE_CONVERSATIONS),
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    return {
      conversations: conversations.map((c) => ({
        conversationId: c.conversationId,
        userMode: c.userMode,
        title: c.title,
        messageCount: c._count.messages,
        lastMessageAt: c.messages[0]?.createdAt.toISOString() ?? c.createdAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Inject an async job result into a conversation as an assistant message.
   * Used by background workers (e.g., report generation, document processing) to push
   * follow-up results into the chat after the original request completes.
   */
  async injectAsyncResult(conversationId: string, result: { text: string; card?: Record<string, unknown> }) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
    });
    if (!conversation) return;

    await this.prisma.conversationMessage.create({
      data: {
        messageId: `msg-async-${Date.now()}`,
        conversation: { connect: { id: conversation.id } },
        role: 'assistant',
        content: result.text,
        inputMode: 'text',
        ...(result.card && { card: result.card as any }),
      },
    });
  }

  async getMessages(conversationId: string, userId: string, tenantId: number) {
    const userDbId = await this.getUserDbId(userId);

    const conversation = ownedConversation(
      await this.prisma.conversation.findUnique({
        where: { conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      }),
      userDbId,
      tenantId,
    );

    return {
      conversationId: conversation.conversationId,
      userMode: conversation.userMode,
      title: conversation.title,
      messages: conversation.messages.map((m) => ({
        messageId: m.messageId,
        role: m.role,
        content: m.content,
        inputMode: m.inputMode,
        intent: m.intent,
        card: m.card,
        action: m.action,
        speakText: m.speakText,
        ...(storedCitations(m.citations) && { citations: storedCitations(m.citations) }),
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}

/**
 * The conversation, if it is this person's in this workspace. A missing conversation, another person's and another
 * workspace's all answer the same 404: existence is never confirmed across owners or workspaces.
 */
export function ownedConversation<T extends { userId: number | null; tenantId: number | null }>(
  conversation: T | null,
  userDbId: number,
  tenantId: number,
): T {
  if (!conversation || conversation.userId !== userDbId || conversation.tenantId !== tenantId) {
    throw new NotFoundException('This conversation was not found');
  }
  return conversation;
}

/**
 * The conversation, if it is still active. An archived one (removed from history by its owner, or by the rolling cap)
 * takes no new turn: a send or a resume answers a 409 `INVALID_STATE`, so the turn never lands in a conversation the
 * person can no longer see. The web starts a new conversation when the open one is removed.
 */
export function activeConversation<T extends { isActive: boolean }>(conversation: T): T {
  if (!conversation.isActive) {
    throw invalidState('This conversation was removed from your history. Start a new conversation to keep chatting.');
  }
  return conversation;
}

/** A chat chunk as its stream frame line, or null for a chunk that is not sent (`complete`). */
export function streamFrameOf(chunk: ChatChunk): string | null {
  switch (chunk.type) {
    case 'text-delta':
    case 'blocked':
      return `${STREAM_FRAME.TEXT}${JSON.stringify(chunk.data)}\n`;
    case 'reading':
      return `${STREAM_FRAME.READING}${chunk.data}\n`;
    case 'citation':
      return `${STREAM_FRAME.CITATION}${chunk.data}\n`;
    case 'card':
      return `${STREAM_FRAME.CARD}${chunk.data}\n`;
    case 'followups':
      return `${STREAM_FRAME.FOLLOWUPS}${chunk.data}\n`;
    case 'suspend':
      return `${STREAM_FRAME.SUSPEND}${chunk.data}\n`;
    case 'complete':
      return null;
  }
}

/** A citation chunk's payload, or null when it is not a valid citation (it is then neither sent nor stored). */
function parseCitation(data: string): Citation | null {
  try {
    const parsed = CitationSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The citations stored on a message, validated on the way out; undefined when there are none. */
function storedCitations(value: unknown): Citation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const citations = value.flatMap((raw) => {
    const parsed = CitationSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  return citations.length > 0 ? citations.slice(0, MAX_CITATIONS_PER_MESSAGE) : undefined;
}
