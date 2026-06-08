import { Controller, Post, Body, Headers, Req, Logger, HttpCode, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { Public } from '../../../../auth/decorators/public.decorator';
import { EmailIntakeService } from '../services/email-intake.service';
import { ResendInboundWebhookDto, ResendInboundEmailDataDto } from '../dto/resend-inbound-webhook.dto';

/**
 * EmailIntakeWebhookController
 *
 * Receives inbound emails from Resend's inbound webhook.
 * Uses @Public() to skip JWT auth — webhook callers are external systems.
 *
 * Resend delivers inbound emails as { type: "email.received", data: {...} }
 * with Svix signature headers (svix-id, svix-timestamp, svix-signature).
 * Full email content must be fetched via the Resend API using the email_id.
 *
 * Route: POST /integrations/email-intake/webhook
 */
@ApiTags('Email Intake')
@Controller('integrations/email-intake/webhook')
export class EmailIntakeWebhookController {
  private readonly logger = new Logger(EmailIntakeWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailIntakeService: EmailIntakeService,
  ) {}

  @Post()
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: 'Receive inbound email from Resend webhook' })
  async handleInbound(
    @Req() req: any,
    @Body() body: any,
    @Headers('svix-id') svixId?: string,
    @Headers('svix-timestamp') svixTimestamp?: string,
    @Headers('svix-signature') svixSignature?: string,
  ) {
    // Support both real Resend envelope { type, data } and legacy/local flat format
    const isResendEnvelope = body && body.type === 'email.received' && body.data != null;

    let emailData: ResendInboundEmailDataDto;

    if (isResendEnvelope) {
      // Real Resend webhook — use the envelope
      const webhookDto = body as ResendInboundWebhookDto;

      // Verify Svix signature when headers are present
      if (svixId && svixTimestamp && svixSignature) {
        this.verifySignature(req, svixId, svixTimestamp, svixSignature);
      } else {
        this.logger.warn('[email-intake-webhook] No Svix signature headers — skipping verification (local/test mode)');
      }

      emailData = webhookDto.data;
    } else {
      // Legacy / local testing format — body is the email data directly
      this.logger.warn('[email-intake-webhook] Received legacy flat payload (no Resend envelope) — local/test mode');
      emailData = body as ResendInboundEmailDataDto;
    }

    // Resolve tenant from recipient address
    const recipientAddress = emailData.to?.[0];
    if (!recipientAddress) {
      this.logger.warn('[email-intake-webhook] No recipient address in payload');
      return { status: 'ignored', reason: 'no_recipient' };
    }

    const resolved = await this.emailIntakeService.resolveTenant(recipientAddress);
    if (!resolved) {
      this.logger.warn(`[email-intake-webhook] No tenant for recipient ${recipientAddress}`);
      return { status: 'ignored', reason: 'unknown_recipient' };
    }

    if (!resolved.isEnabled) {
      this.logger.log(`[email-intake-webhook] Tenant ${resolved.tenantId} has email intake disabled`);
      return { status: 'ignored', reason: 'disabled' };
    }

    this.logger.log(
      `[email-intake-webhook] Processing inbound email for tenant ${resolved.tenantId} from ${emailData.from}`,
    );

    const result = await this.emailIntakeService.processInboundEmail(resolved.tenantId, emailData);

    return { status: 'accepted', ...result };
  }

  /**
   * Verify Svix webhook signature.
   *
   * Svix signs payloads as HMAC-SHA256("${svix-id}.${svix-timestamp}.${rawBody}")
   * using the base64-decoded bytes of the secret after the "whsec_" prefix.
   * The svix-signature header may contain multiple space-separated "v1,<base64sig>" tokens.
   */
  private verifySignature(req: any, svixId: string, svixTimestamp: string, svixSignature: string): void {
    const secret = this.config.get<string>('RESEND_INBOUND_WEBHOOK_SECRET', '');
    if (!secret) {
      this.logger.warn('[email-intake-webhook] RESEND_INBOUND_WEBHOOK_SECRET not set — skipping verification');
      return;
    }

    // Svix secret format: "whsec_<base64key>"
    const secretBytes = Buffer.from(secret.replace('whsec_', ''), 'base64');
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;

    const expectedSignature = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64');

    // svix-signature can be "v1,sig1 v1,sig2" — any match is valid
    const signatures = svixSignature.split(' ').map((s) => s.replace('v1,', ''));
    const isValid = signatures.some((sig) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig, 'base64'), Buffer.from(expectedSignature, 'base64'));
      } catch {
        return false;
      }
    });

    if (!isValid) {
      this.logger.warn('[email-intake-webhook] Invalid Svix webhook signature');
      throw new ForbiddenException('Invalid webhook signature');
    }
  }
}
