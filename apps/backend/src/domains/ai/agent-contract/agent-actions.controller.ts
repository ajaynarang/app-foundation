import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { AgentActionDecisionSchema, type AgentAction, type AgentPolicy } from '@app/shared-types';
import { AgentActionResponse, AgentPolicyResponse } from '../openapi.responses';
import { AgentActionsService, type AgentActionViewer } from './agent-actions.service';
import { UpdateAgentPolicyDto } from './dto/update-agent-policy.dto';

interface SessionUser {
  userId: string;
  tenantId: string;
  role: UserRole;
}

const TOKEN_PARAM = {
  name: 'token',
  description: 'The token the agent was given with approval_required or hitl_required',
};

/**
 * The in-app side of an external agent's write: the page its approval link opens calls these routes. They take a
 * signed-in person's session (JWT auth and `@Roles`); no agent credential passes them, so an agent cannot approve
 * its own request.
 */
@ApiTags('Agent Actions')
@ApiBearerAuth()
@Controller()
export class AgentActionsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly actions: AgentActionsService,
  ) {
    super(prisma);
  }

  @Get('agent-policy')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Whether external agents confirm their own standard writes or wait for a person (default)' })
  @ApiResult(AgentPolicyResponse)
  async getPolicy(@CurrentUser() user: SessionUser): Promise<AgentPolicy> {
    return this.actions.getPolicy(await this.getTenantDbId(user));
  }

  @Put('agent-policy')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Let external agents confirm their own standard writes, or put human approval back' })
  @ApiResult(AgentPolicyResponse)
  async setPolicy(@CurrentUser() user: SessionUser, @Body() dto: UpdateAgentPolicyDto): Promise<AgentPolicy> {
    const tenantId = await this.getTenantDbId(user);
    const userDbId = await this.getUserDbId(user.userId);
    return this.actions.setPolicy(tenantId, dto.selfConfirm, { id: String(userDbId), type: 'user' });
  }

  @Get('agent-actions/:token')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: "An external agent's write waiting for (or past) a person: the tool, the caller, and what it will run",
  })
  @ApiParam(TOKEN_PARAM)
  @ApiResult(AgentActionResponse)
  async get(@CurrentUser() user: SessionUser, @Param('token') token: string): Promise<AgentAction> {
    return this.actions.get(token, await this.viewer(user));
  }

  @Post('agent-actions/:token/approve')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a standard write: the agent may run it once, with exactly these arguments' })
  @ApiParam(TOKEN_PARAM)
  @ApiResult(AgentActionResponse)
  async approve(@CurrentUser() user: SessionUser, @Param('token') token: string): Promise<AgentAction> {
    return this.actions.decide(token, await this.viewer(user), AgentActionDecisionSchema.enum.APPROVE);
  }

  @Post('agent-actions/:token/deny')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deny a write (standard or sensitive): the agent cannot run it' })
  @ApiParam(TOKEN_PARAM)
  @ApiResult(AgentActionResponse)
  async deny(@CurrentUser() user: SessionUser, @Param('token') token: string): Promise<AgentAction> {
    return this.actions.decide(token, await this.viewer(user), AgentActionDecisionSchema.enum.DENY);
  }

  private async viewer(user: SessionUser): Promise<AgentActionViewer> {
    return {
      userDbId: await this.getUserDbId(user.userId),
      tenantId: await this.getTenantDbId(user),
      role: user.role,
    };
  }
}
