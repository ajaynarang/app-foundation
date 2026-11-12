import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';

import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { BaseTenantController } from '@appshore/platform/shared/base/base-tenant.controller';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { resolveApprovalScope } from '../approval/approval.service';

import { DeskEpisodeService } from './desk-episode.service';
import { ResolveEpisodeDto } from './dto/resolve-episode.dto';
import { DeskEpisodeListQueryDto, HandledEpisodeListQueryDto } from './dto/episode-list-query.dto';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  DeskEpisodeDetailResponse,
  DeskEpisodeListResponse,
  DeskEpisodeResolveResultResponse,
  DeskHandledEpisodeListResponse,
} from '../../openapi.responses';

/**
 * HTTP surface for Desk episode reads. Writes (close/retry/approve)
 * happen through ApprovalController + TriggerService; this controller
 * only lists + reads.
 */
@ApiTags('Desk — Episodes')
@ApiBearerAuth()
@Controller('desk/episodes')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class DeskEpisodeController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly episodes: DeskEpisodeService,
  ) {
    super(prisma);
  }

  @Get()
  @ApiOperation({
    summary: 'List episodes for this tenant. Supports status filter + cursor pagination + scope (mine|all).',
  })
  @ApiResult(DeskEpisodeListResponse)
  async list(@CurrentUser() user: any, @Query() query: DeskEpisodeListQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const resolvedScope = resolveApprovalScope(query.scope, user.role);
    return this.episodes.listForTenant(
      tenantDbId,
      { status: query.status, limit: query.limit, cursor: query.cursor, scope: resolvedScope },
      { currentUserId: user.dbId },
    );
  }

  /**
   * List handled (terminal) episodes in a tenant-local window with rich
   * filters. Registered BEFORE `:id` so NestJS doesn't greedily match
   * 'handled' as a UUID.
   */
  @Get('handled')
  @ApiOperation({ summary: 'List handled (terminal) episodes in a window with rich filters' })
  @ApiResult(DeskHandledEpisodeListResponse)
  async listHandled(@CurrentUser() user: any, @Query() query: HandledEpisodeListQueryDto) {
    const tenantDbId = await this.getTenantDbId(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantDbId },
      select: { timezone: true },
    });
    const resolvedScope = resolveApprovalScope(query.scope, user.role);
    return this.episodes.listHandled(
      tenantDbId,
      {
        scope: resolvedScope,
        window: query.window,
        from: query.from,
        to: query.to,
        agent: query.agent,
        outcome: query.outcome,
        q: query.q,
        limit: query.limit,
        cursor: query.cursor,
      },
      { currentUserId: user.dbId, tenantTimezone: tenant?.timezone ?? 'UTC' },
    );
  }

  /**
   * Resolve an escalated episode (ESCALATED → RESOLVED). The operator's exit
   * for an escalation — clears it off the Needs-you tab into Handled. Only
   * ESCALATED episodes are resolvable this way (service enforces the state
   * machine; non-escalated → 400). Tenant-scoped from the JWT. Registered
   * BEFORE `:id` GET so route ordering stays unambiguous.
   */
  @Patch(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resolve an escalated episode (ESCALATED → RESOLVED) with an optional operator note' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Episode id (uuid)' })
  @ApiResult(DeskEpisodeResolveResultResponse)
  async resolve(
    @CurrentUser() user: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ResolveEpisodeDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.episodes.resolveEpisode(tenantDbId, id, user.dbId, body.note);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one episode with its steps + approvals' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Episode id (uuid)' })
  @ApiResult(DeskEpisodeDetailResponse)
  async get(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.episodes.getForTenant(tenantDbId, id);
  }
}
