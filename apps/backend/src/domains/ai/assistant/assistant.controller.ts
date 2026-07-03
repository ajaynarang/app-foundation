import { Controller, Get, Post, Param, Query, Body, Req, Res, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { AssistantAiService } from './assistant.service';
import { AgentRegistry } from '../agents/agent.registry';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ResumeAgentDto } from './dto/resume-agent.dto';
import type { Request, Response } from 'express';

@ApiTags('AI Conversations')
@Controller('conversations')
export class AssistantAiController {
  constructor(
    private readonly service: AssistantAiService,
    private readonly agentRegistry: AgentRegistry,
  ) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Create a new assistant conversation' })
  async createConversation(@CurrentUser() user: any, @Body() dto: CreateConversationDto) {
    return this.service.createConversation(user.userId, user.tenantDbId, dto.userMode);
  }

  @Post(':conversationId/messages')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: 'Send a message and stream assistant response' })
  async sendMessage(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
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
  @ApiOperation({ summary: 'List conversations for the current user' })
  async listConversations(
    @CurrentUser() user: any,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.service.listConversations(user.userId, user.tenantDbId, limit);
  }

  @Post(':conversationId/resume')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Resume a suspended assistant agent (HITL confirmation)',
  })
  async resumeAgent(
    @CurrentUser() user: any,
    @Param('conversationId') conversationId: string,
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

  @Get(':conversationId/messages')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Get messages for a conversation (view-only history)',
  })
  async getMessages(@CurrentUser() user: any, @Param('conversationId') conversationId: string) {
    return this.service.getMessages(conversationId, user.userId, user.tenantDbId);
  }

  @Get('agents/status')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({
    summary: 'Get status of all domain agents for the user persona',
  })
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
