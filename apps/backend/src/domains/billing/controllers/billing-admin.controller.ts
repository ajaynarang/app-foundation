/**
 * Billing Admin Controller
 *
 * Super admin endpoints for managing tenant billing.
 * All routes require SUPER_ADMIN role.
 */
import { Controller, Get, Post, Patch, Param, Body, ParseIntPipe } from '@nestjs/common';
import { UserRole } from '@appshore/db';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
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
  @Post('tenants/:tenantId/subscription')
  async createSubscription(@Param('tenantId', ParseIntPipe) tenantId: number, @Body() dto: AdminCreateSubscriptionDto) {
    return this.billingAdminService.createSubscriptionForTenant(tenantId, dto.plan, dto.quantity, dto.customPriceCents);
  }

  /**
   * Get full billing state for a tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Get('tenants/:tenantId')
  async getTenantBilling(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.billingAdminService.getTenantBilling(tenantId);
  }

  /**
   * Add wallet credits as a gift
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/credit')
  async addCredit(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: AddWalletCreditDto,
    @CurrentUser() user: any,
  ) {
    await this.billingAdminService.addWalletCredit(tenantId, dto.amountCents, dto.reason, user.userId ?? user.email);
    return { success: true };
  }

  /**
   * Issue a refund for a payment
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/refund')
  async issueRefund(@Param('tenantId', ParseIntPipe) tenantId: number, @Body() dto: IssueRefundDto) {
    return this.billingAdminService.issueRefund(tenantId, dto.paymentId, dto.amountCents, dto.reason, dto.creditWallet);
  }

  /**
   * Override the unit price for custom pricing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Patch('tenants/:tenantId/price')
  async overrideUnitPrice(@Param('tenantId', ParseIntPipe) tenantId: number, @Body() dto: OverrideUnitPriceDto) {
    await this.billingAdminService.overrideUnitPrice(tenantId, dto.unitPriceCents);
    return { success: true };
  }

  /**
   * Pause a tenant's billing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/pause')
  async pauseBilling(@Param('tenantId', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.pauseBilling(tenantId);
    return { success: true };
  }

  /**
   * Resume a paused tenant's billing
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/resume')
  async resumeBilling(@Param('tenantId', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.resumeBilling(tenantId);
    return { success: true };
  }

  /**
   * Change subscription plan (upgrade/downgrade or create if none exists)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/change-plan')
  async changeSubscriptionPlan(@Param('tenantId', ParseIntPipe) tenantId: number, @Body() dto: AdminChangePlanDto) {
    return this.billingAdminService.changeSubscriptionPlan(tenantId, dto.plan, dto.quantity);
  }

  /**
   * Immediately cancel a tenant's subscription (not at period end)
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/cancel-immediately')
  async cancelImmediately(@Param('tenantId', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.cancelSubscriptionImmediately(tenantId);
    return { success: true };
  }

  /**
   * Extend a tenant's trial period
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/extend-trial')
  async extendTrial(@Param('tenantId', ParseIntPipe) tenantId: number, @Body() dto: ExtendTrialDto) {
    await this.billingAdminService.extendTrial(tenantId, dto.days);
    return { success: true };
  }

  /**
   * Force-suspend a tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/suspend')
  async forceSuspend(@Param('tenantId', ParseIntPipe) tenantId: number, @Body() dto: ForceSuspendDto) {
    await this.billingAdminService.forceSuspend(tenantId, dto.reason);
    return { success: true };
  }

  /**
   * Reactivate a suspended tenant
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('tenants/:tenantId/reactivate')
  async reactivate(@Param('tenantId', ParseIntPipe) tenantId: number) {
    await this.billingAdminService.reactivate(tenantId);
    return { success: true };
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
