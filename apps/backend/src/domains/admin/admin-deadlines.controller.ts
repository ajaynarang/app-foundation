import { Controller, Get, Inject, Optional, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import type { DeadlineListResponse, DurabilityHealth } from '@app/shared-types';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { DeadlineService } from '@appshore/platform/infrastructure/deadlines/deadline.service';
import { AdminDeadlineListQueryDto } from './dto/admin-deadlines-query.dto';
import {
  AdminDeadlineKindResponse,
  AdminDeadlineListResponse,
  AdminDurabilityHealthResponse,
} from './openapi.responses';
import { OUTBOX_HEALTH_READER, type OutboxHealthReader } from './outbox-health.reader';
import { SystemScope } from '@appshore/kernel/infrastructure/rls/system-scope.decorator';

/**
 * Super-admin Timers (ADR "Outbox and deadlines"): every tenant's deadlines and the durability health strip.
 *
 *   GET /admin/deadlines?state=PENDING,FAILING&kind=&tenant=<slug>&sort=soonest|latest&limit=&cursor=
 *      → cursor-paged by due time, per-state counts for the pivot.
 *
 *   GET /admin/deadlines/kinds
 *      → the kinds on record (options for the kind filter).
 *
 *   GET /admin/deadlines/health
 *      → pending / failing / overdue deadlines, plus the outbox's backlog (unpublished events, oldest age).
 *
 * RBAC: SUPER_ADMIN only — a platform-internal view.
 */
@Controller('admin/deadlines')
@Roles(UserRole.SUPER_ADMIN)
@SystemScope('super-admin')
@ApiTags('Admin Deadlines')
@ApiBearerAuth()
export class AdminDeadlinesController {
  constructor(
    private readonly deadlines: DeadlineService,
    @Optional() @Inject(OUTBOX_HEALTH_READER) private readonly outbox?: OutboxHealthReader,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Deadlines across tenants — cursor-paged by due time, with per-state counts' })
  @ApiResult(AdminDeadlineListResponse)
  async list(@Query() query: AdminDeadlineListQueryDto): Promise<DeadlineListResponse> {
    return this.deadlines.list(query);
  }

  @Get('kinds')
  @ApiOperation({ summary: 'Deadline kinds on record, A → Z — the options of the kind filter' })
  @ApiResult([AdminDeadlineKindResponse])
  async kinds(): Promise<string[]> {
    return this.deadlines.kinds();
  }

  @Get('health')
  @ApiOperation({ summary: 'Deadline sweeper health (pending, failing, overdue) and the outbox backlog' })
  @ApiResult(AdminDurabilityHealthResponse)
  async health(): Promise<DurabilityHealth> {
    const [deadlines, outbox] = await Promise.all([this.deadlines.health(), this.outbox?.health() ?? null]);
    return { deadlines, outbox };
  }
}
