import { Body, Controller, ForbiddenException, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';

import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { ListQueryDto } from '@appshore/kernel/shared/utils/query-dto';

import { DeskAgentService } from './agent.service';
import { DeskAgentEditGuard } from './desk-agent-edit.guard';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentActivityWindowQueryDto } from './dto/agent-activity-query.dto';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  DeskAgentActivityStatsResponse,
  DeskAgentDetailResponse,
  DeskAgentRosterItemResponse,
  DeskAgentUpdateResultResponse,
  DeskEligibleSupervisorListResponse,
} from '../../openapi.responses';

const SUPERVISOR_REASSIGN_ROLES: readonly UserRole[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN];

/**
 * HTTP surface for the Desk Crew tab.
 *
 * Auth: Member + Admin + Owner + SuperAdmin at the class level.
 * Mutation routes further narrow via DeskAgentEditGuard (owner/admin or
 * this agent's supervisor). Supervisor reassignment is OWNER/ADMIN-only —
 * enforced inline in `update()`.
 */
@ApiTags('Desk — Agents')
@ApiBearerAuth()
@Controller('desk/agents')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class DeskAgentController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly agents: DeskAgentService,
  ) {
    super(prisma);
  }

  @Get()
  @ApiOperation({ summary: 'List agents with rollup counts + supervisor for the Crew tab' })
  @ApiResult([DeskAgentRosterItemResponse])
  async list(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.listForTenant(tenantDbId);
  }

  // Must precede `:key` routes so Nest doesn't match the literal as a key.
  @Get('eligible-supervisors')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Tenant users eligible to supervise an agent, by last name (a picker: cursor list with q)' })
  @ApiResult(DeskEligibleSupervisorListResponse)
  async listEligibleSupervisors(@CurrentUser() user: any, @Query() query: ListQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.listEligibleSupervisors(tenantDbId, query);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get one agent detail for the sheet header' })
  @ApiParam({ name: 'key', type: 'string', description: 'Desk agent key (from the agent roster)' })
  @ApiResult(DeskAgentDetailResponse)
  async get(@CurrentUser() user: any, @Param('key') key: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.getDetailForTenant(tenantDbId, key);
  }

  @Get(':key/activity')
  @ApiOperation({ summary: 'Windowed activity stats for the Crew row + sheet tri-cell' })
  @ApiParam({ name: 'key', type: 'string', description: 'Desk agent key (from the agent roster)' })
  @ApiResult(DeskAgentActivityStatsResponse)
  async activity(@CurrentUser() user: any, @Param('key') key: string, @Query() query: AgentActivityWindowQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.getActivity(tenantDbId, key, query.window ?? '7d');
  }

  @Patch(':key')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({
    summary: 'Update agent — bulk enable + supervisor reassignment (owner/admin only)',
  })
  @ApiParam({ name: 'key', type: 'string', description: 'Desk agent key (from the agent roster)' })
  @ApiResult(DeskAgentUpdateResultResponse)
  async update(@CurrentUser() user: any, @Param('key') key: string, @Body() body: UpdateAgentDto) {
    const tenantDbId = await this.getTenantDbId(user);
    if (body.supervisorUserId !== undefined && !SUPERVISOR_REASSIGN_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException('Only owner or admin can reassign supervisor');
    }
    return this.agents.updateAgent(tenantDbId, key, {
      enabled: body.enabled,
      supervisorUserId: body.supervisorUserId,
    });
  }
}
