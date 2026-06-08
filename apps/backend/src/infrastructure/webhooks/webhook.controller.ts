import { Controller, Post, Headers, Body, Req, HttpCode, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../auth/decorators/public.decorator';
import { SamsaraWebhookService } from './samsara-webhook.service';
import { SamsaraWebhookPayload } from './webhook.types';
import * as crypto from 'crypto';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: SamsaraWebhookService,
    private readonly configService: ConfigService,
  ) {}

  @Post('samsara')
  @HttpCode(200)
  @Public()
  async handleSamsaraWebhook(
    @Headers('x-samsara-signature') signature: string,
    @Body() body: SamsaraWebhookPayload,
    @Req() req: any,
  ) {
    const rawBody = req.rawBody as Buffer;

    if (!this.verifySignature(rawBody, signature)) {
      this.logger.warn(`Invalid webhook signature for event ${body.eventId}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(`Received Samsara webhook: ${body.eventType} (${body.eventId})`);
    await this.webhookService.handleEvent(body);
  }

  private verifySignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.configService.get<string>('SAMSARA_WEBHOOK_SECRET');
    if (!secret || !signature) return false;

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }
}
