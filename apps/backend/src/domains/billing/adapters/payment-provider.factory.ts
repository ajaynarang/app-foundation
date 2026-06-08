/**
 * Payment Provider Factory
 *
 * Returns the appropriate payment provider adapter based on the provider type.
 * Currently only Stripe is supported; add new adapters here as needed.
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { BillingProviderType } from '@prisma/client';
import { PaymentProviderAdapter } from './payment-provider.interface';
import { StripeAdapter } from './stripe/stripe.adapter';

@Injectable()
export class PaymentProviderFactory {
  constructor(private readonly stripeAdapter: StripeAdapter) {}

  /**
   * Get the payment provider adapter for the given provider type.
   * Defaults to Stripe if not specified.
   */
  getAdapter(providerType: BillingProviderType = BillingProviderType.STRIPE): PaymentProviderAdapter {
    switch (providerType) {
      case BillingProviderType.STRIPE:
        return this.stripeAdapter;
      default:
        throw new BadRequestException('Unsupported billing provider');
    }
  }
}
