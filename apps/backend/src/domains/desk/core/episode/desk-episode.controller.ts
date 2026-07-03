import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { APPROVAL_SCOPES, ListDeskEpisodesQuerySchema, ListHandledEpisodesQuerySchema } from '../types';

import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

import { resolveApprovalScope } from '../approval/approval.service';

import { DeskEpisodeService } from './desk-episode.service';
import { ResolveEpisodeDto } from './dto/resolve-episode.dto';

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
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'scope', required: false, enum: APPROVAL_SCOPES })
  async list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('scope') scope?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const parsed = ListDeskEpisodesQuerySchema.parse({ status, limit, cursor, scope });
    const resolvedScope = resolveApprovalScope(parsed.scope, user.role);
    return this.episodes.listForTenant(tenantDbId, { ...parsed, scope: resolvedScope }, { currentUserId: user.dbId });
  }

  /**
   * List handled (terminal) episodes in a tenant-local window with rich
   * filters. Registered BEFORE `:id` so NestJS doesn't greedily match
   * 'handled' as a UUID.
   */
  @Get('handled')
  @ApiOperation({ summary: 'List handled (terminal) episodes in a window with rich filters' })
  @ApiQuery({ name: 'scope', required: false, enum: APPROVAL_SCOPES })
  @ApiQuery({ name: 'window', required: false, enum: ['today', '7d', '30d', 'this_month', 'custom'] })
  @ApiQuery({ name: 'from', required: false, description: 'ISO datetime (required when window=custom)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO datetime (required when window=custom)' })
  @ApiQuery({ name: 'agent', required: false, description: 'Agent key filter (e.g. autumn)' })
  @ApiQuery({ name: 'outcome', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Search across entityLabel + responsibility key' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  async listHandled(
    @CurrentUser() user: any,
    @Query('scope') scope?: string,
    @Query('window') window?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('agent') agent?: string,
    @Query('outcome') outcome?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantDbId },
      select: { timezone: true },
    });
    const parsed = ListHandledEpisodesQuerySchema.parse({
      scope,
      window,
      from,
      to,
      agent,
      outcome,
      q,
      limit,
      cursor,
    });
    const resolvedScope = resolveApprovalScope(parsed.scope, user.role);
    return this.episodes.listHandled(
      tenantDbId,
      { ...parsed, scope: resolvedScope },
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
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
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
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async get(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.episodes.getForTenant(tenantDbId, id);
  }
}
