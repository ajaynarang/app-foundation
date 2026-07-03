import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { AGENT_ACTIVITY_WINDOWS, type AgentActivityWindow } from '../types';

import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { DeskAgentService } from './agent.service';
import { DeskAgentEditGuard } from './desk-agent-edit.guard';
import { UpdateAgentDto } from './dto/update-agent.dto';

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
  async list(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.listForTenant(tenantDbId);
  }

  // Must precede `:key` routes so Nest doesn't match the literal as a key.
  @Get('eligible-supervisors')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List tenant users eligible to supervise an agent' })
  async listEligibleSupervisors(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.listEligibleSupervisors(tenantDbId);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get one agent detail for the sheet header' })
  @ApiParam({ name: 'key', type: 'string' })
  async get(@CurrentUser() user: any, @Param('key') key: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.getDetailForTenant(tenantDbId, key);
  }

  @Get(':key/activity')
  @ApiOperation({ summary: 'Windowed activity stats for the Crew row + sheet tri-cell' })
  @ApiParam({ name: 'key', type: 'string' })
  @ApiQuery({ name: 'window', required: false, enum: AGENT_ACTIVITY_WINDOWS })
  async activity(@CurrentUser() user: any, @Param('key') key: string, @Query('window') window: string = '7d') {
    if (!AGENT_ACTIVITY_WINDOWS.includes(window as AgentActivityWindow)) {
      throw new BadRequestException(`Invalid window ${window}. Expected one of: ${AGENT_ACTIVITY_WINDOWS.join(', ')}`);
    }
    const tenantDbId = await this.getTenantDbId(user);
    return this.agents.getActivity(tenantDbId, key, window as AgentActivityWindow);
  }

  @Patch(':key')
  @UseGuards(DeskAgentEditGuard)
  @ApiOperation({
    summary: 'Update agent — bulk enable + supervisor reassignment (owner/admin only)',
  })
  @ApiParam({ name: 'key', type: 'string' })
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
