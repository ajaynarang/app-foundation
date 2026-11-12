import { Controller, Delete, Get, Post, Param, Query, Body, Req, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { AssistantAiService } from './assistant.service';
import { AgentRegistry } from '../agents/agent.registry';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ResumeAgentDto } from './dto/resume-agent.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import type { Request, Response } from 'express';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  AssistantAgentStatusesResponse,
  ConversationCreatedResponse,
  ConversationListResponse,
  ConversationMessagesResponse,
} from '../openapi.responses';

@ApiBearerAuth()
@ApiTags('AI Conversations')
@Controller('conversations')
export class AssistantAiController {
  constructor(
    private readonly service: AssistantAiService,
    private readonly agentRegistry: AgentRegistry,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Create a new assistant conversation' })
  @ApiResult(ConversationCreatedResponse, HttpStatus.CREATED)
  async createConversation(@CurrentUser() user: any, @Body() dto: CreateConversationDto) {
    return this.service.createConversation(user.userId, user.tenantDbId, dto.userMode);
  }

  @Post(':conversation_id/messages')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Send a message and stream assistant response' })
  @ApiParam({ name: 'conversation_id', description: 'Conversation public id (conv_…)' })
  async sendMessage(
    @CurrentUser() user: any,
    @Param('conversation_id') conversationId: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.service.streamMessage(
      conversationId,
      dto.content,
      dto.inputMode,
      user.userId,
      user.tenantDbId,
      req,
      res,
      {
        promptKey: dto.promptKey,
        promptVariables: dto.promptVariables,
      },
    );
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: "List the current user's active conversations (newest first, at most the history cap)",
  })
  @ApiResult(ConversationListResponse)
  async listConversations(@CurrentUser() user: any, @Query() query: ListConversationsQueryDto) {
    return this.service.listConversations(user.userId, user.tenantDbId, query.limit);
  }

  @Delete(':conversation_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Archive one of your conversations: it leaves history; its messages are kept',
  })
  @ApiParam({ name: 'conversation_id', description: 'Conversation public id (conv_…)' })
  @ApiNoContentResponse({ description: 'Archived (or already archived)' })
  async archiveConversation(@CurrentUser() user: any, @Param('conversation_id') conversationId: string): Promise<void> {
    await this.service.archiveConversation(conversationId, user.userId, user.tenantDbId);
  }

  @Post(':conversation_id/resume')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Resume a suspended assistant agent (HITL confirmation)',
  })
  @ApiParam({ name: 'conversation_id', description: 'Conversation public id (conv_…)' })
  async resumeAgent(
    @CurrentUser() user: any,
    @Param('conversation_id') conversationId: string,
    @Body() dto: ResumeAgentDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.service.resumeAgent(
      conversationId,
      dto.confirmed,
      dto.toolCallId,
      dto.runId,
      user.userId,
      user.tenantDbId,
      req,
      res,
    );
  }

  @Get(':conversation_id/messages')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Get messages for a conversation (view-only history)',
  })
  @ApiParam({ name: 'conversation_id', description: 'Conversation public id (conv_…)' })
  @ApiResult(ConversationMessagesResponse)
  async getMessages(@CurrentUser() user: any, @Param('conversation_id') conversationId: string) {
    return this.service.getMessages(conversationId, user.userId, user.tenantDbId);
  }

  @Get('agents/status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Get status of all domain agents for the user persona',
  })
  @ApiResult(AssistantAgentStatusesResponse)
  async getAgentStatuses(@CurrentUser() user: any) {
    const agents = this.agentRegistry.getForPersona(user.userMode);
    const statuses = await Promise.all(
      agents.map(async (agent) => ({
        id: agent.id,
        displayName: agent.displayName,
        status: await agent.getStatus(user.tenantDbId),
      })),
    );
    return { agents: statuses };
  }
}
