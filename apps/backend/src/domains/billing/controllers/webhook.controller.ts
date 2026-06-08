/**
 * Webhook Controller
 *
 * Receives webhook events from payment providers (Stripe).
 * Must be @Public() (no JWT auth) and @SkipThrottle() since webhooks
 * are server-to-server calls that arrive at unpredictable rates.
 *
 * IMPORTANT: Uses raw body for webhook signature verification.
 * The raw body must be preserved before JSON parsing.
 */
import { Controller, Post, Req, Headers, HttpCode, HttpStatus, Logger, BadRequestException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../auth/decorators/public.decorator';
import { PaymentProviderFactory } from '../adapters/payment-provider.factory';
import { BillingEventsHandler } from '../events/billing-events.handler';
import { BillingEventType } from '../adapters/payment-provider.interface';
import { Request } from 'express';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly providerFactory: PaymentProviderFactory,
    private readonly billingEventsHandler: BillingEventsHandler,
  ) {}

  /**
   * Receive billing webhook events from the payment provider.
   * Verifies the signature, normalizes the event, and dispatches to handlers.
   *
   * Returns 200 on success, 400 on invalid signature, 500 on processing failure.
   * The provider will retry on non-2xx responses.
   */
  @Public()
  @SkipThrottle()
  @Post('billing')
  @HttpCode(HttpStatus.OK)
  async handleBillingWebhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const rawBody = (req as any).rawBody as Buffer;
    if (!rawBody) {
      this.logger.error('Raw body not available. Ensure rawBody middleware is configured.');
      throw new BadRequestException('Raw body not available');
    }

    const adapter = this.providerFactory.getAdapter();

    // Verify signature
    if (!adapter.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Invalid webhook signature received');
      throw new BadRequestException('Invalid webhook signature');
    }

    // Parse and normalize the event
    const event = adapter.parseWebhookEvent(rawBody, signature);

    // Skip events we don't handle
    const knownTypes = Object.values(BillingEventType) as string[];
    if (!knownTypes.includes(event.type)) {
      this.logger.debug(`Ignoring unhandled webhook event type: ${event.type}`);
      return { received: true };
    }

    // Dispatch to event handler
    await this.billingEventsHandler.handleEvent(event);

    return { received: true };
  }
}
