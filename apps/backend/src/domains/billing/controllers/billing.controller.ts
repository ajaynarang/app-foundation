/**
 * Billing Controller
 *
 * Tenant-facing billing endpoints for subscription management,
 * wallet operations, invoices, and payment methods.
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { TenantDbId } from '../../../auth/decorators/tenant-db-id.decorator';
import { SubscriptionService } from '../services/subscription.service';
import { WalletService } from '../services/wallet.service';
import { InvoiceService } from '../services/invoice.service';
import { PaymentMethodService } from '../services/payment-method.service';
import {
  CreateCheckoutDto,
  UpgradePlanDto,
  DowngradePlanDto,
  UpdateQuantityDto,
  CancelSubscriptionDto,
  SetupPaymentMethodDto,
  PaginationQueryDto,
} from '../dto/billing.dto';
import { TopUpWalletDto, UpdateAutoReloadDto, WalletTransactionsQueryDto } from '../dto/wallet.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly walletService: WalletService,
    private readonly invoiceService: InvoiceService,
    private readonly paymentMethodService: PaymentMethodService,
  ) {}

  // ─── Subscription ────────────────────────────────────────────────────────

  /**
   * Get billing overview: subscription, wallet, payment methods, upcoming invoice
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('overview')
  async getOverview(@TenantDbId() tenantDbId: number) {
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  /**
   * Create a checkout session for a new subscription
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('checkout')
  async createCheckout(@CurrentUser() user: any, @TenantDbId() tenantDbId: number, @Body() dto: CreateCheckoutDto) {
    return this.subscriptionService.createSubscription(
      user.tenantId,
      tenantDbId,
      dto.plan,
      dto.quantity,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  /**
   * Upgrade to a higher-tier plan
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('upgrade')
  async upgradePlan(@CurrentUser() user: any, @TenantDbId() tenantDbId: number, @Body() dto: UpgradePlanDto) {
    await this.subscriptionService.upgradePlan(user.tenantId, tenantDbId, dto.newPlan, dto.newQuantity);
    return { success: true };
  }

  /**
   * Downgrade to a lower-tier plan (takes effect at period end)
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('downgrade')
  async downgradePlan(@CurrentUser() user: any, @TenantDbId() tenantDbId: number, @Body() dto: DowngradePlanDto) {
    await this.subscriptionService.downgradePlan(user.tenantId, tenantDbId, dto.newPlan);
    return { success: true };
  }

  /**
   * Update the truck/vehicle quantity on the subscription
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('quantity')
  async updateQuantity(@CurrentUser() user: any, @TenantDbId() tenantDbId: number, @Body() dto: UpdateQuantityDto) {
    await this.subscriptionService.updateQuantity(user.tenantId, tenantDbId, dto.quantity);
    return { success: true };
  }

  /**
   * Cancel subscription (takes effect at end of current billing period)
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('cancel')
  async cancelSubscription(
    @CurrentUser() user: any,
    @TenantDbId() tenantDbId: number,
    @Body() dto: CancelSubscriptionDto,
  ) {
    await this.subscriptionService.cancelSubscription(user.tenantId, tenantDbId, dto.reason);
    return { success: true };
  }

  /**
   * Reactivate a subscription that was scheduled for cancellation
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('reactivate')
  async reactivateSubscription(@CurrentUser() user: any, @TenantDbId() tenantDbId: number) {
    await this.subscriptionService.reactivateSubscription(user.tenantId, tenantDbId);
    return { success: true };
  }

  // ─── Wallet ──────────────────────────────────────────────────────────────

  /**
   * Get wallet balance and recent transactions
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('wallet')
  async getWallet(@TenantDbId() tenantDbId: number) {
    return this.walletService.getBalance(tenantDbId);
  }

  /**
   * Top up the wallet by charging the default payment method
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('wallet/top-up')
  async topUpWallet(@TenantDbId() tenantDbId: number, @Body() dto: TopUpWalletDto) {
    await this.walletService.topUp(tenantDbId, dto.amountCents);
    return { success: true };
  }

  /**
   * Update auto-reload settings
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('wallet/auto-reload')
  async updateAutoReload(@TenantDbId() tenantDbId: number, @Body() dto: UpdateAutoReloadDto) {
    await this.walletService.updateAutoReload(tenantDbId, {
      enabled: dto.enabled,
      thresholdCents: dto.thresholdCents,
      reloadAmountCents: dto.reloadAmountCents,
    });
    return { success: true };
  }

  /**
   * Get paginated wallet transaction history
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('wallet/transactions')
  async getTransactions(@TenantDbId() tenantDbId: number, @Query() query: WalletTransactionsQueryDto) {
    return this.walletService.getTransactions(tenantDbId, {
      type: query.type,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  // ─── Invoices ────────────────────────────────────────────────────────────

  /**
   * List invoices for the current tenant
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('invoices')
  async listInvoices(@TenantDbId() tenantDbId: number, @Query() query: PaginationQueryDto) {
    return this.invoiceService.listInvoices(tenantDbId, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /**
   * Get the upcoming invoice preview
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('invoices/upcoming')
  async getUpcomingInvoice(@TenantDbId() tenantDbId: number) {
    return this.invoiceService.getUpcomingInvoice(tenantDbId);
  }

  /**
   * Download an invoice PDF
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('invoices/:id/download')
  async downloadInvoice(@TenantDbId() tenantDbId: number, @Param('id') invoiceId: string) {
    return this.invoiceService.downloadInvoice(tenantDbId, invoiceId);
  }

  // ─── Payment Methods ─────────────────────────────────────────────────────

  /**
   * Create a setup session to add a new payment method
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('payment-methods/setup')
  async setupPaymentMethod(@TenantDbId() tenantDbId: number, @Body() dto: SetupPaymentMethodDto) {
    return this.paymentMethodService.addPaymentMethod(tenantDbId, dto.returnUrl);
  }

  /**
   * List all payment methods
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('payment-methods')
  async listPaymentMethods(@TenantDbId() tenantDbId: number) {
    return this.paymentMethodService.listPaymentMethods(tenantDbId);
  }

  /**
   * Set a payment method as the default
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('payment-methods/:id/default')
  async setDefaultPaymentMethod(@TenantDbId() tenantDbId: number, @Param('id') paymentMethodId: string) {
    await this.paymentMethodService.setDefault(tenantDbId, paymentMethodId);
    return { success: true };
  }

  /**
   * Remove a payment method
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Delete('payment-methods/:id')
  async removePaymentMethod(@TenantDbId() tenantDbId: number, @Param('id') paymentMethodId: string) {
    await this.paymentMethodService.removePaymentMethod(tenantDbId, paymentMethodId);
    return { success: true };
  }
}
