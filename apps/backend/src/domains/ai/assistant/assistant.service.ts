import { Injectable, Logger, NotFoundException, ForbiddenException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { generateId } from '../../../shared/utils/id-generator';
import { CardAccumulator, McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from './mastra/mastra.provider';
import { ModerationService } from '../moderation/moderation.service';
import { PromptingService } from '../../../domains/prompting';
import { AssistantRouterService } from '../orchestrator/assistant-router.service';
import { AgentRegistry } from '../agents/agent.registry';
import { AiTelemetryService } from '../infrastructure/telemetry/ai-telemetry.service';
import { AiBudgetExceededError } from '../infrastructure/telemetry/ai-budget-exceeded.error';
import { UserMode } from '../agents/agent.types';
import type { Request, Response } from 'express';
import { pipeAgentResponse } from './utils/pipe-agent-response';
import { parseFollowups } from './utils/parse-followups';

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
  ) {}

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
   * Validate that the conversation exists and belongs to the given user/tenant.
   * Returns the conversation record or sends an error JSON response.
   */
  private async validateConversationOwnership(
    conversationId: string,
    userId: string,
    tenantId: number,
    res: Response,
  ): Promise<{
    id: number;
    conversationId: string;
    userMode: string;
    title: string | null;
  } | null> {
    try {
      const userDbId = await this.getUserDbId(userId);

      const found = await this.prisma.conversation.findUnique({
        where: { conversationId },
      });

      if (!found) {
        throw new NotFoundException(`Conversation ${conversationId} not found`);
      }

      if (found.userId !== userDbId || found.tenantId !== tenantId) {
        throw new ForbiddenException('Access denied');
      }

      return found;
    } catch (error) {
      if (error instanceof HttpException) {
        res.status(error.getStatus()).json({
          statusCode: error.getStatus(),
          message: error.message,
        });
        return null;
      }
      this.logger.error(`Ownership validation error for conversation ${conversationId}`, error);
      res.status(500).json({ statusCode: 500, message: 'Internal server error' });
      return null;
    }
  }

  async createConversation(userId: string, tenantId: number, userMode: string) {
    const userDbId = await this.getUserDbId(userId);
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
  ): AsyncGenerator<{
    type: 'text-delta' | 'card' | 'suspend' | 'blocked' | 'complete' | 'followups';
    data: string;
  }> {
    // 1. Validate conversation ownership (throws on failure)
    const userDbId = await this.getUserDbId(userId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
    if (conversation.userId !== userDbId || conversation.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied');
    }

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
      const inputResult = await this.moderationService.moderate(content, 'input', conversation.userMode);

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

    // 4b. AI cost budget — block chat if the tenant is over its hard cap.
    // assertBudget fails open (allows on its own infra error), so this only
    // throws on a genuine hard breach. We answer assistant-style rather than
    // surfacing a raw 402 mid-stream, and persist it like the moderation
    // block so the conversation history is coherent.
    try {
      await this.aiTelemetry.assertBudget(tenantId);
    } catch (budgetError) {
      if (budgetError instanceof AiBudgetExceededError) {
        const budgetText =
          "I've hit your account's AI usage limit for now. Ask your administrator to raise the budget and I'll be right back.";
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
    const routeResult = await this.assistantRouter.route(content, conversation.userMode as UserMode);

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
    });

    // 7. Yield chunks from domain agent (same protocol as before)
    let assistantText = '';
    let cardData: string | undefined;
    let suspendData: string | undefined;

    for await (const chunk of agentStream) {
      switch (chunk.type) {
        case 'text-delta':
          assistantText += chunk.data;
          yield chunk;
          break;
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
        if (!res.headersSent) {
          res.status(500).json({
            statusCode: 500,
            message: 'Failed to resolve prompt',
          });
        }
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

        switch (chunk.type) {
          case 'text-delta':
            res.write(`0:${JSON.stringify(chunk.data)}\n`);
            break;
          case 'blocked':
            res.write(`0:${JSON.stringify(chunk.data)}\n`);
            break;
          case 'card':
            res.write(`8:${chunk.data}\n`);
            break;
          case 'followups':
            res.write(`a:${chunk.data}\n`);
            break;
          case 'suspend':
            res.write(`9:${chunk.data}\n`);
            break;
          case 'complete':
            break;
        }
      }
    } catch (error) {
      this.logger.error(`AI streaming error for conversation ${conversationId}`, error);
      if (!res.headersSent) {
        res.status(500).json({ statusCode: 500, message: 'AI streaming failed' });
      }
    }

    res.end();
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
    const conversation = await this.validateConversationOwnership(conversationId, userId, tenantId, res);
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
    const agentId = this.assistantRouter.defaultAgentFor(conversation.userMode as UserMode);
    const agent = this.mastra.getMastra().getAgent(agentId);

    try {
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
      });
    } catch (error) {
      this.logger.error(`Resume error for conversation ${conversationId}`, error);
      if (!res.headersSent) {
        res.status(500).json({ statusCode: 500, message: 'Resume failed' });
      }
    }
  }

  async listConversations(userId: string, tenantId: number, limit: number = 10) {
    const userDbId = await this.getUserDbId(userId);

    const conversations = await this.prisma.conversation.findMany({
      where: { userId: userDbId, tenantId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
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
   * Used by background workers (e.g., route planning, Shield audits) to push
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

    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userDbId || conversation.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied');
    }

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
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}
