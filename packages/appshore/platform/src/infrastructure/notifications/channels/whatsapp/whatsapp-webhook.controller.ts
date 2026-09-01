import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../../auth/decorators/public.decorator';
import type { Request, Response } from 'express';
import { DeliveryLedgerService } from '../../pipeline/delivery-ledger.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { WHATSAPP_PORT, type WhatsAppPort } from './whatsapp.port';

/** Meta requires STOP to be honoured; "STOP." and "stop please" are still a stop. */
const STOP_REQUEST = /^\s*(stop|unsubscribe)\b/i;

@Controller('webhooks')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    @Inject(WHATSAPP_PORT) private readonly whatsapp: WhatsAppPort,
    private readonly ledger: DeliveryLedgerService,
    private readonly consent: WhatsAppConsentService,
  ) {}

  /** Meta's one-time subscription handshake: echo the challenge as plain text, or refuse. */
  @Public()
  @SkipThrottle()
  @Get('whatsapp')
  verify(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response): string {
    const challenge = this.whatsapp.verifyChallenge?.(query) ?? null;
    if (challenge === null) throw new ForbiddenException('Verify token mismatch');
    res.type('text/plain');
    return challenge;
  }

  /** Always 200 once the signature checks out — a vendor that gets a 4xx retries forever. */
  @Public()
  @SkipThrottle()
  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() req: Request) {
    const presented = req.headers[this.whatsapp.signatureHeader];
    const signature = Array.isArray(presented) ? presented[0] : presented;
    if (!this.whatsapp.verifySignature((req as Request & { rawBody?: Buffer }).rawBody, signature)) {
      this.logger.warn('Rejected WhatsApp webhook with an invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    for (const event of this.whatsapp.parseWebhook(req.body)) {
      if (event.kind === 'status') {
        const moved = await this.ledger.applyProviderStatus({
          providerMessageId: event.providerMessageId,
          status: event.status,
          at: event.at,
          failureReason: event.failureReason,
          callbackData: event.callbackData,
        });
        if (!moved)
          this.logger.debug(`WhatsApp status ${event.status} for ${event.providerMessageId} matched no open row`);
      } else if (STOP_REQUEST.test(event.text)) {
        // The one word we read. Everything else a person types here is not ours to keep.
        await this.consent.optOutByPhone(event.from);
      }
    }

    return { received: true };
  }
}
