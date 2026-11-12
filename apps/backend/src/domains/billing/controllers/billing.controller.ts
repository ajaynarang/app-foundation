/**
 * Billing Controller
 *
 * Tenant-facing billing endpoints for subscription management,
 * wallet operations, invoices, and payment methods.
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { UserRole } from '@appshore/db';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { TenantDbId } from '@appshore/platform/auth/decorators/tenant-db-id.decorator';
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
import { ApiNoContentResponse, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  BillingCheckoutSessionResponse,
  BillingInvoiceDownloadResponse,
  BillingInvoiceListResponse,
  BillingInvoicePreviewResponse,
  BillingOverviewResponse,
  BillingPaymentMethodResponse,
  BillingPaymentMethodSetupResponse,
  BillingWalletBalanceResponse,
  BillingWalletTransactionListResponse,
} from '../openapi.responses';

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
  @ApiOperation({ summary: 'Billing overview — subscription, wallet, payment methods and the upcoming invoice' })
  @ApiResult(BillingOverviewResponse)
  async getOverview(@TenantDbId() tenantDbId: number) {
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  /**
   * Create a checkout session for a new subscription
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a provider checkout for a new subscription — refused while one is already active' })
  @ApiResult(BillingCheckoutSessionResponse)
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upgrade to a higher-tier plan (prorated now); answers the refreshed overview' })
  @ApiResult(BillingOverviewResponse)
  async upgradePlan(@CurrentUser() user: any, @TenantDbId() tenantDbId: number, @Body() dto: UpgradePlanDto) {
    await this.subscriptionService.upgradePlan(user.tenantId, tenantDbId, dto.newPlan, dto.newQuantity);
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  /**
   * Downgrade to a lower-tier plan (takes effect at period end)
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('downgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Schedule a downgrade to a lower-tier plan at period end; answers the refreshed overview' })
  @ApiResult(BillingOverviewResponse)
  async downgradePlan(@CurrentUser() user: any, @TenantDbId() tenantDbId: number, @Body() dto: DowngradePlanDto) {
    await this.subscriptionService.downgradePlan(user.tenantId, tenantDbId, dto.newPlan);
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  /**
   * Update the seat/unit quantity on the subscription
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('quantity')
  @ApiOperation({ summary: 'Change the seat / unit quantity (prorated); answers the refreshed overview' })
  @ApiResult(BillingOverviewResponse)
  async updateQuantity(@CurrentUser() user: any, @TenantDbId() tenantDbId: number, @Body() dto: UpdateQuantityDto) {
    await this.subscriptionService.updateQuantity(user.tenantId, tenantDbId, dto.quantity);
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  /**
   * Cancel subscription (takes effect at end of current billing period)
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel the subscription at period end; answers the refreshed overview' })
  @ApiResult(BillingOverviewResponse)
  async cancelSubscription(
    @CurrentUser() user: any,
    @TenantDbId() tenantDbId: number,
    @Body() dto: CancelSubscriptionDto,
  ) {
    await this.subscriptionService.cancelSubscription(user.tenantId, tenantDbId, dto.reason);
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  /**
   * Reactivate a subscription that was scheduled for cancellation
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a scheduled cancellation; answers the refreshed overview' })
  @ApiResult(BillingOverviewResponse)
  async reactivateSubscription(@CurrentUser() user: any, @TenantDbId() tenantDbId: number) {
    await this.subscriptionService.reactivateSubscription(user.tenantId, tenantDbId);
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  // ─── Wallet ──────────────────────────────────────────────────────────────

  /**
   * Get wallet balance and recent transactions
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('wallet')
  @ApiOperation({ summary: 'Wallet balance with the 10 newest transactions (creates the wallet on first read)' })
  @ApiResult(BillingWalletBalanceResponse)
  async getWallet(@TenantDbId() tenantDbId: number) {
    return this.walletService.getBalance(tenantDbId);
  }

  /**
   * Top up the wallet by charging the default payment method
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('wallet/top-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Top up the wallet by charging the default payment method; answers the new balance' })
  @ApiResult(BillingWalletBalanceResponse)
  async topUpWallet(@TenantDbId() tenantDbId: number, @Body() dto: TopUpWalletDto) {
    await this.walletService.topUp(tenantDbId, dto.amountCents);
    return this.walletService.getBalance(tenantDbId);
  }

  /**
   * Update auto-reload settings
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('wallet/auto-reload')
  @ApiOperation({ summary: 'Update wallet auto-reload settings; answers the balance' })
  @ApiResult(BillingWalletBalanceResponse)
  async updateAutoReload(@TenantDbId() tenantDbId: number, @Body() dto: UpdateAutoReloadDto) {
    await this.walletService.updateAutoReload(tenantDbId, {
      enabled: dto.enabled,
      thresholdCents: dto.thresholdCents,
      reloadAmountCents: dto.reloadAmountCents,
    });
    return this.walletService.getBalance(tenantDbId);
  }

  /**
   * Get paginated wallet transaction history
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('wallet/transactions')
  @ApiOperation({ summary: 'Wallet ledger — a cursor list with per-type counts' })
  @ApiResult(BillingWalletTransactionListResponse)
  async getTransactions(@TenantDbId() tenantDbId: number, @Query() query: WalletTransactionsQueryDto) {
    return this.walletService.getTransactions(tenantDbId, query);
  }

  // ─── Invoices ────────────────────────────────────────────────────────────

  /**
   * List invoices for the current tenant
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('invoices')
  @ApiOperation({ summary: 'Invoices — a cursor list with per-status counts' })
  @ApiResult(BillingInvoiceListResponse)
  async listInvoices(@TenantDbId() tenantDbId: number, @Query() query: PaginationQueryDto) {
    return this.invoiceService.listInvoices(tenantDbId, query);
  }

  /**
   * Get the upcoming invoice preview
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('invoices/upcoming')
  @ApiOperation({ summary: 'Live preview of the next invoice from the payment provider' })
  @ApiResult(BillingInvoicePreviewResponse)
  async getUpcomingInvoice(@TenantDbId() tenantDbId: number) {
    return this.invoiceService.getUpcomingInvoice(tenantDbId);
  }

  /**
   * Download an invoice PDF
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('invoices/:id/download')
  @ApiOperation({ summary: 'Invoice PDF and hosted-page links — 404 when the PDF is not available' })
  @ApiParam({ name: 'id', description: 'Invoice id (cuid, from GET /billing/invoices)' })
  @ApiResult(BillingInvoiceDownloadResponse)
  async downloadInvoice(@TenantDbId() tenantDbId: number, @Param('id') invoiceId: string) {
    return this.invoiceService.downloadInvoice(tenantDbId, invoiceId);
  }

  // ─── Payment Methods ─────────────────────────────────────────────────────

  /**
   * Create a setup session to add a new payment method
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Post('payment-methods/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a provider setup session to add a payment method' })
  @ApiResult(BillingPaymentMethodSetupResponse)
  async setupPaymentMethod(@TenantDbId() tenantDbId: number, @Body() dto: SetupPaymentMethodDto) {
    return this.paymentMethodService.addPaymentMethod(tenantDbId, dto.returnUrl);
  }

  /**
   * List all payment methods
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.MEMBER)
  @Get('payment-methods')
  @ApiOperation({ summary: 'Payment methods on file — default first' })
  @ApiResult([BillingPaymentMethodResponse])
  async listPaymentMethods(@TenantDbId() tenantDbId: number) {
    return this.paymentMethodService.listPaymentMethods(tenantDbId);
  }

  /**
   * Set a payment method as the default
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Patch('payment-methods/:id/default')
  @ApiOperation({ summary: 'Make a payment method the default; answers the refreshed overview' })
  @ApiParam({ name: 'id', description: 'Payment method id (cuid, from GET /billing/payment-methods)' })
  @ApiResult(BillingOverviewResponse)
  async setDefaultPaymentMethod(@TenantDbId() tenantDbId: number, @Param('id') paymentMethodId: string) {
    await this.paymentMethodService.setDefault(tenantDbId, paymentMethodId);
    return this.subscriptionService.getBillingOverview(tenantDbId);
  }

  /**
   * Remove a payment method
   */
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @Delete('payment-methods/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a payment method' })
  @ApiParam({ name: 'id', description: 'Payment method id (cuid, from GET /billing/payment-methods)' })
  @ApiNoContentResponse({ description: 'Removed' })
  async removePaymentMethod(@TenantDbId() tenantDbId: number, @Param('id') paymentMethodId: string): Promise<void> {
    await this.paymentMethodService.removePaymentMethod(tenantDbId, paymentMethodId);
  }
}
