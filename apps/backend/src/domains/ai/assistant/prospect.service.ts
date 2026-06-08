import { Injectable, Logger, NotFoundException, ForbiddenException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { generateId } from '../../../shared/utils/id-generator';
import { getPersonaConfig } from '../../../domains/prompting/prompts/persona/persona.config';
import { McpToolService } from '../mcp/mcp-tool.service';
import { MastraProvider } from './mastra/mastra.provider';
import { PromptingService } from '../../../domains/prompting';
import { pipeAgentResponse } from './utils/pipe-agent-response';
import { ConversationSessionService } from './services/conversation-session.service';
import type { Request, Response } from 'express';

@Injectable()
export class ProspectService {
  private readonly logger = new Logger(ProspectService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpToolService: McpToolService,
    private readonly mastra: MastraProvider,
    private readonly promptService: PromptingService,
    private readonly sessions: ConversationSessionService,
  ) {}

  async createConversation() {
    const conversationId = generateId('conv');
    const greetingMessageId = generateId('msg');

    const greetingText =
      "Hi! I'm SALLY. I can tell you about our fleet operations platform, pricing, integrations, or set up a demo. What would you like to know?";

    const conversation = await this.prisma.conversation.create({
      data: {
        conversationId,
        userMode: 'prospect',
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

    const session = await this.sessions.issue(conversation.id, {});
    const greeting = conversation.messages[0];

    return {
      conversationId: conversation.conversationId,
      sessionToken: session.token,
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

  async streamMessage(
    conversationId: string,
    sessionToken: string,
    content: string,
    inputMode: string,
    req: Request,
    res: Response,
  ) {
    let conversation: Awaited<ReturnType<typeof this.prisma.conversation.findUnique>> & {
      messages: any[];
    };
    try {
      const found = await this.prisma.conversation.findUnique({
        where: { conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' as const },
            take: 50,
          },
        },
      });

      if (!found) {
        throw new NotFoundException(`Conversation ${conversationId} not found`);
      }

      const session = await this.sessions.resolveActive(sessionToken);
      if (!session || session.conversationId !== found.id) {
        throw new ForbiddenException('Invalid session token');
      }

      if (found.userMode !== 'prospect') {
        throw new ForbiddenException('Not a prospect conversation');
      }

      conversation = found;
    } catch (error) {
      if (error instanceof HttpException) {
        res.status(error.getStatus()).json({
          statusCode: error.getStatus(),
          message: error.message,
        });
        return;
      }
      this.logger.error(`Pre-stream error for prospect conversation ${conversationId}`, error);
      res.status(500).json({ statusCode: 500, message: 'Internal server error' });
      return;
    }

    // Store user message
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

    // Auto-set title from first user message
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        ...(conversation.title ? {} : { title: content.slice(0, 100) }),
        updatedAt: new Date(),
      },
    });

    // Get prospect-filtered toolsets
    const persona = getPersonaConfig('prospect');
    const toolsets = await this.mcpToolService.getToolsetsForPersona('prospect');

    // Fetch prompt from LangFuse (falls back to hardcoded if unavailable)
    const instructions = await this.promptService.getPrompt('sally-prospect');

    // Retrieve registered agent from Mastra instance
    const agent = this.mastra.getMastra().getAgent('sally-prospect');

    // Stream response via Mastra Agent. Prospect chat is unauthenticated (no
    // tenant) — group the Langfuse trace under the conversation so the session
    // shape matches authenticated chat (`conversation_message:<id>`).
    try {
      const response = await agent.stream(content, {
        instructions,
        toolsets,
        memory: {
          thread: conversationId,
          resource: `prospect-${sessionToken}`,
        },
        maxSteps: persona.maxToolSteps,
        tracingOptions: {
          metadata: { sessionId: `conversation_message:${conversationId}`, userId: 'prospect' },
          tags: ['APP_CHAT', 'sally-prospect'],
        },
      });

      await pipeAgentResponse(response as any, {
        conversationDbId: conversation.id,
        conversationId,
        req,
        res,
        prisma: this.prisma,
        logger: this.logger,
      });
    } catch (error) {
      this.logger.error(`AI streaming error for prospect conversation ${conversationId}`, error);
      if (!res.headersSent) {
        res.status(500).json({ statusCode: 500, message: 'AI streaming failed' });
      }
    }
  }

  async getMessages(conversationId: string, sessionToken: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const session = await this.sessions.resolveActive(sessionToken);
    if (!session || session.conversationId !== conversation.id) {
      throw new ForbiddenException('Invalid session token');
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
