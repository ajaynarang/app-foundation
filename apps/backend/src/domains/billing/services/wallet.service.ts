/**
 * Wallet Service
 *
 * Manages the dollar-denominated prepaid wallet for each tenant.
 * Used for overage billing (add-on usage beyond included limits).
 *
 * Key design decisions:
 * - Atomic deductions using raw SQL to prevent race conditions
 * - Auto-reload triggers after deductions if balance drops below threshold
 * - All transactions are immutable audit records
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PaymentProviderFactory } from '../adapters/payment-provider.factory';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  /**
   * Get the wallet for a tenant, creating one with $0 balance if it doesn't exist.
   */
  async getOrCreateWallet(tenantDbId: number) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { tenantId: tenantDbId },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { tenantId: tenantDbId },
      });
      this.logger.log(`Wallet created for tenant ${tenantDbId}`);
    }

    return wallet;
  }

  /**
   * Get the wallet balance along with recent transactions.
   */
  async getBalance(tenantDbId: number) {
    const wallet = await this.getOrCreateWallet(tenantDbId);

    const recentTransactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      wallet,
      recentTransactions,
    };
  }

  /**
   * Top up the wallet by charging the tenant's default payment method.
   * Creates a WalletTransaction and updates the wallet balance.
   */
  async topUp(tenantDbId: number, amountCents: number): Promise<void> {
    const wallet = await this.getOrCreateWallet(tenantDbId);
    const adapter = this.providerFactory.getAdapter();

    // Find the billing customer for the charge
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { tenantId: tenantDbId },
    });
    if (!billingCustomer) {
      throw new BadRequestException('No billing customer found. Please set up billing first.');
    }

    // Verify tenant has a payment method on file
    const paymentMethods = await adapter.listPaymentMethods(billingCustomer.providerCustomerId);
    if (paymentMethods.length === 0) {
      throw new BadRequestException('No payment method on file. Add a payment method before topping up.');
    }

    // Charge via the payment provider
    const providerPaymentId = await adapter.chargeOneTime({
      providerCustomerId: billingCustomer.providerCustomerId,
      amountCents,
      description: `Wallet top-up: $${(amountCents / 100).toFixed(2)}`,
      metadata: { tenantId: String(tenantDbId), walletId: wallet.id },
    });

    // Update wallet balance and create transaction atomically
    await this.prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceCents: { increment: amountCents },
          lifetimeLoadedCents: { increment: amountCents },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          tenantId: tenantDbId,
          type: WalletTransactionType.TOP_UP,
          amountCents,
          balanceAfterCents: updatedWallet.balanceCents,
          description: `Wallet top-up: $${(amountCents / 100).toFixed(2)}`,
          providerPaymentId,
          createdBy: 'tenant',
        },
      });
    });

    this.logger.log(`Wallet topped up for tenant ${tenantDbId}: +$${(amountCents / 100).toFixed(2)}`);
  }

  /**
   * Atomically deduct an overage charge from the wallet.
   * Uses raw SQL for atomicity: only deducts if balance >= amount.
   *
   * Returns { allowed: true } if deduction succeeded, or
   * { allowed: false, currentBalance } if insufficient funds.
   */
  async deductOverage(
    tenantDbId: number,
    addOnId: string,
    amountCents: number,
    description: string,
  ): Promise<{ allowed: boolean; currentBalance: number }> {
    const wallet = await this.getOrCreateWallet(tenantDbId);

    // Atomic balance check + deduction using raw SQL
    const rowsAffected = await this.prisma.$executeRaw`
      UPDATE wallets
      SET balance_cents = balance_cents - ${amountCents},
          lifetime_consumed_cents = lifetime_consumed_cents + ${amountCents},
          updated_at = NOW()
      WHERE tenant_id = ${tenantDbId}
        AND balance_cents >= ${amountCents}
    `;

    if (rowsAffected === 0) {
      // Insufficient balance
      const current = await this.prisma.wallet.findUnique({
        where: { tenantId: tenantDbId },
        select: { balanceCents: true },
      });
      return {
        allowed: false,
        currentBalance: current?.balanceCents ?? 0,
      };
    }

    // Get updated balance for the transaction record
    const updated = await this.prisma.wallet.findUnique({
      where: { tenantId: tenantDbId },
      select: { balanceCents: true },
    });

    await this.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        tenantId: tenantDbId,
        type: WalletTransactionType.OVERAGE_DEDUCTION,
        amountCents: -amountCents,
        balanceAfterCents: updated?.balanceCents ?? 0,
        description,
        relatedAddOnId: addOnId,
        createdBy: 'system',
      },
    });

    this.logger.log(`Overage deducted for tenant ${tenantDbId}: -$${(amountCents / 100).toFixed(2)} (${description})`);

    // Check if auto-reload should be triggered
    await this.checkAutoReload(tenantDbId);

    return {
      allowed: true,
      currentBalance: updated?.balanceCents ?? 0,
    };
  }

  /**
   * Add a credit to the wallet (admin gift). No payment provider charge.
   */
  async addCredit(tenantDbId: number, amountCents: number, reason: string, createdBy: string): Promise<void> {
    const wallet = await this.getOrCreateWallet(tenantDbId);

    await this.prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceCents: { increment: amountCents },
          lifetimeLoadedCents: { increment: amountCents },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          tenantId: tenantDbId,
          type: WalletTransactionType.ADMIN_CREDIT,
          amountCents,
          balanceAfterCents: updatedWallet.balanceCents,
          description: `Admin credit: ${reason}`,
          createdBy,
        },
      });
    });

    this.logger.log(`Admin credit added for tenant ${tenantDbId}: +$${(amountCents / 100).toFixed(2)} (${reason})`);
  }

  /**
   * Refund an overage deduction back to the wallet.
   * Used when an overage charge was applied but the underlying operation failed.
   */
  async refundOverage(tenantDbId: number, addOnId: string, amountCents: number, description: string): Promise<void> {
    const wallet = await this.getOrCreateWallet(tenantDbId);

    await this.prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceCents: { increment: amountCents },
          lifetimeConsumedCents: { decrement: amountCents },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          tenantId: tenantDbId,
          type: WalletTransactionType.REFUND,
          amountCents,
          balanceAfterCents: updatedWallet.balanceCents,
          description,
          relatedAddOnId: addOnId,
          createdBy: 'system',
        },
      });
    });

    this.logger.log(`Overage refunded for tenant ${tenantDbId}: +$${(amountCents / 100).toFixed(2)} (${description})`);
  }

  /**
   * Add a refund credit to the wallet. No payment provider charge.
   */
  async refundToWallet(tenantDbId: number, amountCents: number, reason: string): Promise<void> {
    const wallet = await this.getOrCreateWallet(tenantDbId);

    await this.prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balanceCents: { increment: amountCents },
          lifetimeLoadedCents: { increment: amountCents },
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          tenantId: tenantDbId,
          type: WalletTransactionType.REFUND,
          amountCents,
          balanceAfterCents: updatedWallet.balanceCents,
          description: `Refund: ${reason}`,
          createdBy: 'system',
        },
      });
    });

    this.logger.log(`Refund credited for tenant ${tenantDbId}: +$${(amountCents / 100).toFixed(2)}`);
  }

  /**
   * Update the auto-reload settings for a tenant's wallet.
   */
  async updateAutoReload(
    tenantDbId: number,
    settings: {
      enabled: boolean;
      thresholdCents?: number;
      reloadAmountCents?: number;
    },
  ): Promise<void> {
    const wallet = await this.getOrCreateWallet(tenantDbId);

    if (settings.enabled) {
      if (!settings.thresholdCents || !settings.reloadAmountCents) {
        throw new BadRequestException('Threshold and reload amount are required when enabling auto-reload');
      }
    }

    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        autoReloadEnabled: settings.enabled,
        autoReloadThresholdCents: settings.enabled ? settings.thresholdCents : null,
        autoReloadAmountCents: settings.enabled ? settings.reloadAmountCents : null,
      },
    });

    this.logger.log(`Auto-reload ${settings.enabled ? 'enabled' : 'disabled'} for tenant ${tenantDbId}`);
  }

  /**
   * Check if auto-reload should be triggered after a deduction.
   * Automatically tops up the wallet if balance drops below threshold.
   */
  async checkAutoReload(tenantDbId: number): Promise<void> {
    // Atomic lock: only proceed if eligible AND no auto-reload in the last 5 minutes
    const result = await this.prisma.$executeRaw`
      UPDATE wallets
      SET updated_at = NOW()
      WHERE tenant_id = ${tenantDbId}
        AND auto_reload_enabled = true
        AND balance_cents <= COALESCE(auto_reload_threshold_cents, 0)
        AND auto_reload_amount_cents IS NOT NULL
        AND auto_reload_amount_cents > 0
        AND NOT EXISTS (
          SELECT 1 FROM wallet_transactions
          WHERE wallet_id = wallets.id
            AND type = 'AUTO_RELOAD'
            AND created_at > NOW() - INTERVAL '5 minutes'
        )
    `;

    if (result === 0) {
      return; // Either not eligible or recent auto-reload already happened
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { tenantId: tenantDbId },
    });
    if (!wallet || !wallet.autoReloadEnabled || !wallet.autoReloadAmountCents) return;

    try {
      const adapter = this.providerFactory.getAdapter();
      const billingCustomer = await this.prisma.billingCustomer.findUnique({
        where: { tenantId: tenantDbId },
      });
      if (!billingCustomer) return;

      const providerPaymentId = await adapter.chargeOneTime({
        providerCustomerId: billingCustomer.providerCustomerId,
        amountCents: wallet.autoReloadAmountCents,
        description: `Wallet auto-reload: $${(wallet.autoReloadAmountCents / 100).toFixed(2)}`,
        metadata: {
          tenantId: String(tenantDbId),
          walletId: wallet.id,
          autoReload: 'true',
        },
      });

      await this.prisma.$transaction(async (tx) => {
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balanceCents: { increment: wallet.autoReloadAmountCents },
            lifetimeLoadedCents: { increment: wallet.autoReloadAmountCents },
          },
        });
        const transaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            tenantId: tenantDbId,
            type: WalletTransactionType.AUTO_RELOAD,
            amountCents: wallet.autoReloadAmountCents,
            balanceAfterCents: updatedWallet.balanceCents,
            description: `Auto-reload: $${(wallet.autoReloadAmountCents / 100).toFixed(2)}`,
            providerPaymentId,
            createdBy: 'system',
          },
        });
        return { updatedWallet, transaction };
      });

      this.logger.log(
        `Auto-reload completed for tenant ${tenantDbId}: +$${(wallet.autoReloadAmountCents / 100).toFixed(2)}`,
      );
    } catch (error) {
      this.logger.error(`Auto-reload failed for tenant ${tenantDbId}: ${error}`, (error as Error).stack);
      // Don't throw — auto-reload failure shouldn't break the calling flow
    }
  }

  /**
   * Get paginated transaction history for a tenant's wallet.
   */
  async getTransactions(
    tenantDbId: number,
    filters?: {
      type?: WalletTransactionType;
      limit?: number;
      cursor?: string;
    },
  ) {
    const wallet = await this.getOrCreateWallet(tenantDbId);

    const take = filters?.limit ?? 20;
    const where: any = { walletId: wallet.id };
    if (filters?.type) {
      where.type = filters.type;
    }

    const transactions = await this.prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1, // fetch one extra for cursor
      ...(filters?.cursor && {
        cursor: { id: filters.cursor },
        skip: 1,
      }),
    });

    const hasMore = transactions.length > take;
    const items = hasMore ? transactions.slice(0, take) : transactions;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
  }
}
