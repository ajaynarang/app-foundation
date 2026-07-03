/**
 * Payment Method Service
 *
 * Manages payment methods (cards, bank accounts) for tenants.
 * Syncs with the payment provider and maintains local records.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentMethodType } from '@appshore/db';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PaymentProviderFactory } from '../adapters/payment-provider.factory';

@Injectable()
export class PaymentMethodService {
  private readonly logger = new Logger(PaymentMethodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  /**
   * Create a setup session to add a new payment method.
   * Returns the provider-hosted setup URL.
   */
  async addPaymentMethod(tenantDbId: number, returnUrl: string): Promise<{ setupUrl: string }> {
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { tenantId: tenantDbId },
    });
    if (!billingCustomer) {
      throw new BadRequestException('No billing customer found. Please set up billing first.');
    }

    const adapter = this.providerFactory.getAdapter();
    const setupUrl = await adapter.createSetupSession(billingCustomer.providerCustomerId, returnUrl);

    return { setupUrl };
  }

  /**
   * List all payment methods for a tenant.
   * Syncs with Stripe first to pick up cards added via Checkout.
   */
  async listPaymentMethods(tenantDbId: number) {
    // Sync from Stripe to ensure we have cards added via Checkout
    try {
      await this.syncPaymentMethods(tenantDbId);
    } catch (error) {
      this.logger.warn(`Failed to sync payment methods from Stripe for tenant ${tenantDbId}: ${error}`);
    }

    return this.prisma.paymentMethod.findMany({
      where: { tenantId: tenantDbId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Set a payment method as the default.
   * Unsets the previous default and syncs with the provider.
   */
  async setDefault(tenantDbId: number, paymentMethodId: string): Promise<void> {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, tenantId: tenantDbId },
    });
    if (!method) {
      throw new NotFoundException('Payment method not found');
    }

    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { tenantId: tenantDbId },
    });
    if (!billingCustomer) {
      throw new BadRequestException('No billing customer found');
    }

    // Update provider
    const adapter = this.providerFactory.getAdapter();
    await adapter.setDefaultPaymentMethod(billingCustomer.providerCustomerId, method.providerPaymentMethodId);

    // Update local records: unset all, then set the selected one
    await this.prisma.$transaction([
      this.prisma.paymentMethod.updateMany({
        where: { tenantId: tenantDbId },
        data: { isDefault: false },
      }),
      this.prisma.paymentMethod.update({
        where: { id: paymentMethodId },
        data: { isDefault: true },
      }),
    ]);

    this.logger.log(`Default payment method set for tenant ${tenantDbId}: ${paymentMethodId}`);
  }

  /**
   * Remove a payment method from both the provider and local database.
   * Cannot remove the only/default payment method if there's an active subscription.
   */
  async removePaymentMethod(tenantDbId: number, paymentMethodId: string): Promise<void> {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, tenantId: tenantDbId },
    });
    if (!method) {
      throw new NotFoundException('Payment method not found');
    }

    // Check if this is the only method with an active subscription
    if (method.isDefault) {
      const activeSubscription = await this.prisma.billingSubscription.findFirst({
        where: {
          tenantId: tenantDbId,
          status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
        },
      });

      if (activeSubscription) {
        const methodCount = await this.prisma.paymentMethod.count({
          where: { tenantId: tenantDbId },
        });
        if (methodCount <= 1) {
          throw new BadRequestException('Cannot remove the only payment method while an active subscription exists');
        }
      }
    }

    // Remove from provider
    const adapter = this.providerFactory.getAdapter();
    await adapter.deletePaymentMethod(method.providerPaymentMethodId);

    // Remove from local DB
    await this.prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    this.logger.log(`Payment method removed for tenant ${tenantDbId}: ${paymentMethodId}`);
  }

  /**
   * Sync payment methods from the provider to the local database.
   * Called from webhook events when payment methods are attached/detached.
   */
  async syncPaymentMethods(tenantDbId: number): Promise<void> {
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { tenantId: tenantDbId },
    });
    if (!billingCustomer) return;

    const adapter = this.providerFactory.getAdapter();
    const providerMethods = await adapter.listPaymentMethods(billingCustomer.providerCustomerId);

    // Get existing local methods
    const localMethods = await this.prisma.paymentMethod.findMany({
      where: { tenantId: tenantDbId },
    });

    const localByProviderId = new Map(localMethods.map((m) => [m.providerPaymentMethodId, m]));
    const providerIds = new Set(providerMethods.map((m) => m.providerPaymentMethodId));

    // Add new methods from provider
    for (const pm of providerMethods) {
      if (!localByProviderId.has(pm.providerPaymentMethodId)) {
        await this.prisma.paymentMethod.create({
          data: {
            tenantId: tenantDbId,
            billingCustomerId: billingCustomer.id,
            providerPaymentMethodId: pm.providerPaymentMethodId,
            type: pm.type === 'card' ? PaymentMethodType.CARD : PaymentMethodType.US_BANK_ACCOUNT,
            last4: pm.last4,
            brand: pm.brand,
            expMonth: pm.expMonth,
            expYear: pm.expYear,
            isDefault: localMethods.length === 0, // first method is default
          },
        });
      }
    }

    // Remove methods that no longer exist at the provider
    for (const local of localMethods) {
      if (!providerIds.has(local.providerPaymentMethodId)) {
        await this.prisma.paymentMethod.delete({
          where: { id: local.id },
        });
      }
    }

    this.logger.log(`Payment methods synced for tenant ${tenantDbId}: ${providerMethods.length} from provider`);
  }

  /**
   * Sync payment methods using the provider customer ID (from webhooks).
   */
  async syncPaymentMethodsByCustomerId(providerCustomerId: string): Promise<void> {
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { providerCustomerId },
    });
    if (!billingCustomer) {
      this.logger.warn(`BillingCustomer not found for payment method sync: ${providerCustomerId}`);
      return;
    }

    await this.syncPaymentMethods(billingCustomer.tenantId);
  }
}
