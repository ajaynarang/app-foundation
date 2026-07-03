import { Body, Controller, Get, Logger, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';

import { Roles } from '../../auth/decorators/roles.decorator';
import { AdminAiSpendService } from './admin-ai-spend.service';
import { UpdateAiBudgetDto } from './dto/update-ai-budget.dto';

/**
 * Super-admin AI Spend view. Reads from the `vw_ai_cost_*` views over
 * `ai_invocations`. Three endpoints:
 *
 *   GET /admin/ai-spend/tenants?days=7
 *      → per-tenant totals + sparkline, sorted by spend desc.
 *
 *   GET /admin/ai-spend/tenants/:tenant_id/by-surface?days=7
 *      → per-surface breakdown for one tenant in the window.
 *
 *   GET /admin/ai-spend/tenants/:tenant_id/invocations?surface=&limit=&cursor=
 *      → cursor-paginated invocation list with Langfuse trace ids for
 *        deep-link from the UI.
 *
 * RBAC: SUPER_ADMIN only. Plan/feature gating not applicable — this is a
 * platform-internal view.
 */
@Controller('admin/ai-spend')
@Roles(UserRole.SUPER_ADMIN)
@ApiTags('Admin AI Spend')
@ApiBearerAuth()
export class AdminAiSpendController {
  private readonly logger = new Logger(AdminAiSpendController.name);

  constructor(private readonly service: AdminAiSpendService) {}

  @Get('tenants')
  @ApiOperation({ summary: 'List tenants with their N-day AI spend' })
  async listTenants(@Query('days') daysParam?: string) {
    const days = clampDays(daysParam, 7);
    return this.service.listTenantSummaries({ days });
  }

  @Get('tenants/:tenant_id/by-surface')
  @ApiOperation({ summary: 'Per-surface AI spend breakdown for one tenant' })
  @ApiParam({ name: 'tenant_id' })
  async surfaceBreakdown(@Param('tenant_id', ParseIntPipe) tenantId: number, @Query('days') daysParam?: string) {
    const days = clampDays(daysParam, 7);
    return this.service.listSurfaceBreakdown({ tenantId, days });
  }

  @Get('tenants/:tenant_id/invocations')
  @ApiOperation({ summary: 'List AI invocations for one tenant (cursor-paginated)' })
  @ApiParam({ name: 'tenant_id' })
  async invocations(
    @Param('tenant_id', ParseIntPipe) tenantId: number,
    @Query('surface') surface?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = parseInt(limit ?? '50', 10);
    return this.service.listInvocations({
      tenantId,
      surface,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 50,
      cursor,
    });
  }

  @Get('tenants/:tenant_id/budget')
  @ApiOperation({ summary: "Get a tenant's AI cost budget caps" })
  @ApiParam({ name: 'tenant_id' })
  async getBudget(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    return this.service.getBudget(tenantId);
  }

  @Patch('tenants/:tenant_id/budget')
  @ApiOperation({ summary: "Update a tenant's AI cost budget caps" })
  @ApiParam({ name: 'tenant_id' })
  async updateBudget(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: UpdateAiBudgetDto) {
    return this.service.updateBudget(tenantId, dto);
  }

  @Get('tenants/:tenant_id/cost-vs-quota')
  @ApiOperation({ summary: 'Cost (USD) vs quota (feature counts) for one tenant, side by side' })
  @ApiParam({ name: 'tenant_id' })
  async costVsQuota(@Param('tenant_id', ParseIntPipe) tenantId: number, @Query('days') daysParam?: string) {
    const days = clampDays(daysParam, 30);
    return this.service.getCostVsQuota({ tenantId, days });
  }
}

/**
 * Clamp the `?days=` query param to [1, 90]. Pre-validated default keeps
 * the home view fast and stops a runaway 365-day scan from a malicious or
 * fat-fingered request.
 */
function clampDays(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 90);
}
