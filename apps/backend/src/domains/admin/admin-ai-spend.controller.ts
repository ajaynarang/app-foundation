import { Body, Controller, Get, Logger, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';

import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { AdminAiSpendService } from './admin-ai-spend.service';
import { UpdateAiBudgetDto } from './dto/update-ai-budget.dto';
import {
  AiSpendInvocationListQueryDto,
  AiSpendTenantListQueryDto,
  AiSpendQuotaWindowQueryDto,
  AiSpendWindowQueryDto,
} from './dto/ai-spend-query.dto';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  AdminAiBudgetResponse,
  AdminAiCostVsQuotaResponse,
  AdminAiSpendInvocationListResponse,
  AdminAiSpendSummaryResponse,
  AdminAiSpendSurfaceRowResponse,
  AdminAiSpendTenantListResponse,
} from './openapi.responses';
import { SystemScope, TargetTenant } from '@appshore/kernel/infrastructure/rls/system-scope.decorator';

/**
 * Super-admin AI Spend view. Reads from the `vw_ai_cost_*` views over
 * `ai_invocations`. Three endpoints:
 *
 *   GET /admin/ai-spend/tenants?days=7&q=&limit=&cursor=
 *      → cursor-paged per-tenant totals + sparkline, highest spend first.
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
@SystemScope('super-admin')
@ApiTags('Admin AI Spend')
@ApiBearerAuth()
export class AdminAiSpendController {
  private readonly logger = new Logger(AdminAiSpendController.name);

  constructor(private readonly service: AdminAiSpendService) {}

  @Get('tenants')
  @ApiOperation({ summary: 'Tenants with their N-day AI spend: cursor-paged, highest spend first' })
  @ApiResult(AdminAiSpendTenantListResponse)
  async listTenants(@Query() query: AiSpendTenantListQueryDto) {
    return this.service.listTenants(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'The N-day AI spend across every tenant, in one figure' })
  @ApiResult(AdminAiSpendSummaryResponse)
  async summary(@Query() query: AiSpendWindowQueryDto) {
    return this.service.getSummary({ days: query.days });
  }

  @Get('tenants/:tenant_id/by-surface')
  @TargetTenant('tenant_id')
  @ApiOperation({ summary: 'Per-surface AI spend breakdown for one tenant' })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric id (listed in id-boundary.allowlist.json)' })
  @ApiResult([AdminAiSpendSurfaceRowResponse])
  async surfaceBreakdown(@Param('tenant_id', ParseIntPipe) tenantId: number, @Query() query: AiSpendWindowQueryDto) {
    return this.service.listSurfaceBreakdown({ tenantId, days: query.days });
  }

  @Get('tenants/:tenant_id/invocations')
  @TargetTenant('tenant_id')
  @ApiOperation({ summary: 'List AI invocations for one tenant (cursor-paginated)' })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric id (listed in id-boundary.allowlist.json)' })
  @ApiResult(AdminAiSpendInvocationListResponse)
  async invocations(@Param('tenant_id', ParseIntPipe) tenantId: number, @Query() query: AiSpendInvocationListQueryDto) {
    return this.service.listInvocations({ tenantId, surface: query.surface, limit: query.limit, cursor: query.cursor });
  }

  @Get('tenants/:tenant_id/budget')
  @TargetTenant('tenant_id')
  @ApiOperation({ summary: "Get a tenant's AI cost budget caps" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric id (listed in id-boundary.allowlist.json)' })
  @ApiResult(AdminAiBudgetResponse)
  async getBudget(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    return this.service.getBudget(tenantId);
  }

  @Patch('tenants/:tenant_id/budget')
  @TargetTenant('tenant_id')
  @ApiOperation({ summary: "Update a tenant's AI cost budget caps" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric id (listed in id-boundary.allowlist.json)' })
  @ApiResult(AdminAiBudgetResponse)
  async updateBudget(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: UpdateAiBudgetDto) {
    return this.service.updateBudget(tenantId, dto);
  }

  @Get('tenants/:tenant_id/cost-vs-quota')
  @TargetTenant('tenant_id')
  @ApiOperation({ summary: 'Cost (USD) vs quota (feature counts) for one tenant, side by side' })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric id (listed in id-boundary.allowlist.json)' })
  @ApiResult(AdminAiCostVsQuotaResponse)
  async costVsQuota(@Param('tenant_id', ParseIntPipe) tenantId: number, @Query() query: AiSpendQuotaWindowQueryDto) {
    return this.service.getCostVsQuota({ tenantId, days: query.days });
  }
}
