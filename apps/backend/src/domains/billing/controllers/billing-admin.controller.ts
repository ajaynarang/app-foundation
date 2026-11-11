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

@Controller('admin/billing')
export class BillingAdminController {
  constructor(private readonly billingAdminService: BillingAdminService) {}

  /**
   * Create a subscription for a tenant (admin-provisioned, no checkout)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/subscription')
  @HttpCode(HttpStatus.CREATED)
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
  async getTenantBilling(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Add wallet credits as a gift
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/credit')
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.OK)
  async issueRefund(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: IssueRefundDto) {
    return this.billingAdminService.issueRefund(tenantId, dto.paymentId, dto.amountCents, dto.reason, dto.creditWallet);
  }

  /**
   * Override the unit price for custom pricing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('tenants/:tenant_id/price')
  async overrideUnitPrice(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: OverrideUnitPriceDto) {
    await this.billingAdminService.overrideUnitPrice(tenantId, dto.unitPriceCents);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Pause a tenant's billing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseBilling(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.pauseBilling(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Resume a paused tenant's billing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeBilling(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.resumeBilling(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Change subscription plan (upgrade/downgrade or create if none exists)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/change-plan')
  @HttpCode(HttpStatus.OK)
  async changeSubscriptionPlan(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: AdminChangePlanDto) {
    return this.billingAdminService.changeSubscriptionPlan(tenantId, dto.plan, dto.quantity);
  }

  /**
   * Immediately cancel a tenant's subscription (not at period end)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/cancel-immediately')
  @HttpCode(HttpStatus.OK)
  async cancelImmediately(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.cancelSubscriptionImmediately(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Extend a tenant's trial period
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/extend-trial')
  @HttpCode(HttpStatus.OK)
  async extendTrial(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: ExtendTrialDto) {
    await this.billingAdminService.extendTrial(tenantId, dto.days);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Force-suspend a tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/suspend')
  @HttpCode(HttpStatus.OK)
  async forceSuspend(@Param('tenant_id', ParseIntPipe) tenantId: number, @Body() dto: ForceSuspendDto) {
    await this.billingAdminService.forceSuspend(tenantId, dto.reason);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Reactivate a suspended tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenant_id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivate(@Param('tenant_id', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.reactivate(tenantId);
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Get revenue statistics (MRR, ARR, ARPU, churn, etc.)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Get('revenue')
  async getRevenueStats() {
    return this.billingAdminService.getRevenueStats();
  }
}
