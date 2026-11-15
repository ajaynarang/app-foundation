/**
 * Billing Admin Controller
 *
 * Super admin endpoints for managing tenant billing.
 * All routes require SUPER_ADMIN role.
 */
import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { UserRole } from '@appshore/db';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { BillingAdminService } from '../services/billing-admin.service';
import {
  AddWalletCreditDto,
  IssueRefundDto,
  OverrideUnitPriceDto,
  ExtendTrialDto,
  ForceSuspendDto,
  AdminCreateSubscriptionDto,
  AdminChangePlanDto,
} from '../dto/billing.dto';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  BillingAdminPlanChangeResponse,
  BillingAdminRefundResponse,
  BillingAdminSubscriptionCreatedResponse,
  BillingAdminTenantBillingResponse,
  BillingRevenueStatsResponse,
} from '../openapi.responses';
import { SystemScope, TargetTenant } from '@appshore/kernel/infrastructure/rls/system-scope.decorator';

@Controller('admin/billing')
export class BillingAdminController {
  constructor(private readonly billingAdminService: BillingAdminService) {}

  /**
   * Create a subscription for a tenant (admin-provisioned, no checkout)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/subscription')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision a subscription for a tenant without checkout — refused while one is active' })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminSubscriptionCreatedResponse, HttpStatus.CREATED)
  async createSubscription(
    @Param('tenant_id', ParseIntPipe) tenantId: number,
    @Body() dto: AdminCreateSubscriptionDto,
  ) {
    return this.billingAdminService.createSubscriptionForTenant(tenantId, dto.plan, dto.quantity, dto.customPriceCents);
  }

  /**
   * Get full billing state for a tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Get('tenants/:tenant_id')
  @TargetTenant('tenant_id')
  @ApiOperation({
    summary: "A tenant's full billing state — plan, subscription, wallet, payment methods, recent invoices",
  })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async getTenantBilling(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Add wallet credits as a gift
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/credit')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Gift wallet credit to a tenant; answers the tenant's billing state" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async addCredit(
    @Param('tenant_id', ParseIntPipe) tenantId: number,
    @Body() dto: AddWalletCreditDto,
    @CurrentUser() user: any,
  ) {
    await this.billingAdminService.addWalletCredit(tenantId, dto.amountCents, dto.reason, user.userId ?? user.email);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Issue a refund for a payment
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/refund')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a provider payment, optionally crediting the wallet' })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminRefundResponse)
  async issueRefund(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: IssueRefundDto) {
    return this.billingAdminService.issueRefund(tenantId, dto.paymentId, dto.amountCents, dto.reason, dto.creditWallet);
  }

  /**
   * Override the unit price for custom pricing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('tenants/:tenant_id/price')
  @TargetTenant('tenant_id')
  @ApiOperation({ summary: "Override the subscription's unit price; answers the tenant's billing state" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async overrideUnitPrice(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: OverrideUnitPriceDto) {
    await this.billingAdminService.overrideUnitPrice(tenantId, dto.unitPriceCents);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Pause a tenant's billing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/pause')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Pause a tenant's billing; answers the tenant's billing state" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async pauseBilling(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.pauseBilling(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Resume a paused tenant's billing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/resume')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resume a paused tenant's billing; answers the tenant's billing state" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async resumeBilling(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.resumeBilling(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Change subscription plan (upgrade/downgrade or create if none exists)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/change-plan')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change a tenant's plan immediately (upgrade, downgrade, or create when none is active)" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminPlanChangeResponse)
  async changeSubscriptionPlan(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: AdminChangePlanDto) {
    return this.billingAdminService.changeSubscriptionPlan(tenantId, dto.plan, dto.quantity);
  }

  /**
   * Immediately cancel a tenant's subscription (not at period end)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/cancel-immediately')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancel a tenant's subscription now, not at period end; answers the tenant's billing state",
  })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async cancelImmediately(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.cancelSubscriptionImmediately(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Extend a tenant's trial period
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/extend-trial')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Extend a tenant's trial; answers the tenant's billing state" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async extendTrial(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: ExtendTrialDto) {
    await this.billingAdminService.extendTrial(tenantId, dto.days);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Force-suspend a tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/suspend')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Force-suspend a tenant; answers the tenant's billing state" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async forceSuspend(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: ForceSuspendDto) {
    await this.billingAdminService.forceSuspend(tenantId, dto.reason);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Reactivate a suspended tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/reactivate')
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reactivate a suspended tenant; answers the tenant's billing state" })
  @ApiParam({ name: 'tenant_id', description: 'Tenant numeric database id' })
  @ApiResult(BillingAdminTenantBillingResponse)
  async reactivate(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.reactivate(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Get revenue statistics (MRR, ARR, ARPU, churn, etc.)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Get('revenue')
  @SystemScope('super-admin')
  @ApiOperation({ summary: 'Revenue statistics — MRR, ARR, ARPU, churn, add-on adoption' })
  @ApiResult(BillingRevenueStatsResponse)
  async getRevenueStats() {
    return this.billingAdminService.getRevenueStats();
  }
}
