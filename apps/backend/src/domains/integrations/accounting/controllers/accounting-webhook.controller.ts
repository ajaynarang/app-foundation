import { Controller, Post, Headers, Req, HttpCode, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../../auth/decorators/public.decorator';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { QUEUE_NAMES, FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';
import { QuickBooksAdapter } from '../vendors/quickbooks/quickbooks.adapter';
import { AccountingSyncJobData } from '../accounting-job.types';

/**
 * AccountingWebhookController
 *
 * Receives QuickBooks webhook CDC (Change Data Capture) events.
 * QB requires a 200 response within a few seconds, so we:
 * 1. Validate HMAC signature
 * 2. Parse events
 * 3. Queue jobs for each relevant event
 * 4. Return 200 immediately
 *
 * Route: POST /accounting/webhook
 */
@Controller('accounting')
export class AccountingWebhookController {
  private readonly logger = new Logger(AccountingWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
    private readonly qbAdapter: QuickBooksAdapter,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.FINANCE)
    private readonly financeQueue: Queue,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  @Public()
  async handleWebhook(@Headers('intuit-signature') signature: string, @Req() req: any) {
    const rawBody = req.rawBody as Buffer;

    if (!rawBody) {
      this.logger.warn('QB webhook received without raw body');
      return { received: true };
    }

    // Validate HMAC signature — both token and header are required
    const verifierToken = this.config.get<string>('QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN', '');
    const payloadStr = rawBody.toString('utf8');

    if (!verifierToken) {
      this.logger.error('QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN is not configured — rejecting webhook');
      throw new UnauthorizedException('Webhook endpoint not configured');
    }

    if (!signature) {
      this.logger.warn('QB webhook received without intuit-signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const isValid = this.qbAdapter.validateWebhookSignature(payloadStr, signature, verifierToken);
    if (!isValid) {
      this.logger.warn('Invalid QB webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Parse events
    let payload: unknown;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      this.logger.warn('QB webhook: invalid JSON body');
      return { received: true };
    }

    const events = this.qbAdapter.parseWebhookEvents(payload);
    this.logger.log(`QB webhook received: ${events.length} events`);

    // Process Payment and BillPayment events
    for (const event of events) {
      if (!['Create', 'Update'].includes(event.operation)) continue;
      if (!['Payment', 'BillPayment'].includes(event.eventType)) continue;

      // Find the integration config by realmId
      const integrationConfig = await this.findIntegrationByRealmId(event.realmId);
      if (!integrationConfig) {
        this.logger.warn(`No integration found for QB realmId: ${event.realmId}`);
        continue;
      }

      const jobType =
        event.eventType === 'Payment' ? FINANCE_JOB_NAMES.WEBHOOK_PAYMENT : FINANCE_JOB_NAMES.WEBHOOK_BILL_PAYMENT;

      const job = await this.jobService.createJob({
        tenantId: integrationConfig.tenantId,
        submittedBy: null,
        category: 'finance',
        type: jobType,
        inputData: {
          integrationId: integrationConfig.integrationId,
          entityId: event.entityId,
          eventType: event.eventType,
          realmId: event.realmId,
          triggerSource: 'webhook',
        },
      });

      const payload: AccountingSyncJobData = {
        jobId: job.id,
        tenantId: integrationConfig.tenantId,
        integrationId: integrationConfig.integrationId,
        type: jobType,
        triggerSource: 'webhook',
        entityId: event.entityId,
        webhookPayload: {
          entityId: event.entityId,
          eventType: event.eventType,
          realmId: event.realmId,
        },
      };
      await this.financeQueue.add(
        jobType,
        buildJobEnvelope(payload, {
          tenantId: String(integrationConfig.tenantId),
          source: 'webhook',
        }),
      );

      this.logger.log(`Queued ${jobType} job ${job.id} for QB entity ${event.entityId}`);
    }

    // QB requires a fast 200 response
    return { received: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findIntegrationByRealmId(realmId: string) {
    // Use plaintext realmId column for O(1) lookup (no credential decryption needed)
    return this.prisma.integrationConfig.findFirst({
      where: {
        realmId,
        integrationType: 'ACCOUNTING',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
    });
  }
}
