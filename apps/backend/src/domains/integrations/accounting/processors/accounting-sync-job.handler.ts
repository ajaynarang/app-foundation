import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../../infrastructure/queue/job-handler.contract';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { AccountingSyncJobData, AccountingSyncResult } from '../accounting-job.types';
import { AccountingSyncService } from '../services/accounting-sync.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { QuickBooksApiError } from '../vendors/quickbooks/quickbooks-api.client';

/**
 * Owns the accounting-sync job names on the `finance` queue (INVOICE,
 * SETTLEMENT, PAYMENT, SETTLEMENT_PAYMENT, WEBHOOK_PAYMENT, WEBHOOK_BILL_PAYMENT,
 * INITIAL_SYNC). A plain handler — the single FinanceQueueProcessor dispatcher
 * routes by name and owns the shared dead-letter path. Payloads are wrapped in
 * the standard `JobEnvelope`.
 */
@Injectable()
export class AccountingSyncJobHandler implements QueueJobHandler {
  readonly jobNames = [
    FINANCE_JOB_NAMES.INVOICE,
    FINANCE_JOB_NAMES.SETTLEMENT,
    FINANCE_JOB_NAMES.PAYMENT,
    FINANCE_JOB_NAMES.SETTLEMENT_PAYMENT,
    FINANCE_JOB_NAMES.WEBHOOK_PAYMENT,
    FINANCE_JOB_NAMES.WEBHOOK_BILL_PAYMENT,
    FINANCE_JOB_NAMES.INITIAL_SYNC,
  ];
  private readonly logger = new Logger(AccountingSyncJobHandler.name);

  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
    private readonly syncService: AccountingSyncService,
    private readonly events: DomainEventService,
  ) {}

  async run(bullJob: Job<JobEnvelope<AccountingSyncJobData>>): Promise<AccountingSyncResult | void> {
    // Envelope-wrapped payload (all producers wrap with buildJobEnvelope).
    const envelope = bullJob.data;
    const data = envelope.payload;

    const { type, tenantId, integrationId, triggerSource } = data;

    if (envelope.correlationId) {
      this.logger.log(`Processing ${bullJob.name} [correlation: ${envelope.correlationId}]`);
    }

    // Skip if tenant has paused jobs
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { jobsPaused: true },
    });
    if (tenant?.jobsPaused) {
      this.logger.log(`Skipping accounting job — tenant ${tenantId} is paused`);
      return {
        recordsProcessed: 0,
        details: { skipped: 'tenant_paused' },
      } as any;
    }

    // For repeatable/scheduled jobs, jobId may not be pre-set — create one
    let jobId = data.jobId;

    if (!jobId) {
      const job = await this.jobService.createJob({
        tenantId,
        submittedBy: null,
        category: 'finance',
        type,
        inputData: {
          integrationId,
          triggerSource,
          entityId: data.entityId,
        },
      });
      jobId = job.id;
    }

    this.logger.log(`Processing accounting job ${jobId}: type=${type}, tenant=${tenantId}`);

    await this.jobService.markProcessing(jobId);

    await this.events.emit(SALLY_EVENTS.ACCOUNTING_STARTED, tenantId, {
      entityId: jobId,
      entityType: 'accounting-sync',
      jobId,
      type,
      integrationId,
      triggerSource,
    });

    const startTime = Date.now();

    try {
      let result: AccountingSyncResult;

      switch (type) {
        case 'invoice':
          result = await this.syncService.syncInvoice(tenantId, data.entityId);
          break;

        case 'settlement':
          result = await this.syncService.syncSettlement(tenantId, data.entityId);
          break;

        case 'payment':
          result = await this.syncService.syncPayment(tenantId, data.entityId);
          break;

        case 'settlement-payment':
          result = await this.syncService.syncSettlementPayment(tenantId, data.entityId);
          break;

        case 'initial-sync':
          result = await this.syncService.runInitialSync(tenantId);
          break;

        case 'webhook-payment':
          result = await this.handleWebhookPayment(tenantId, data);
          break;

        case 'webhook-bill-payment':
          result = await this.handleWebhookBillPayment(tenantId, data);
          break;

        default:
          throw new BadRequestException('Unknown accounting job type');
      }

      const durationMs = Date.now() - startTime;

      await this.jobService.markCompleted(jobId, { ...result, durationMs });

      await this.events.emit(SALLY_EVENTS.ACCOUNTING_COMPLETED, tenantId, {
        entityId: jobId,
        entityType: 'accounting-sync',
        jobId,
        type,
        integrationId,
        ...result,
        durationMs,
      });

      this.logger.log(`Accounting job ${jobId} completed in ${durationMs}ms`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      const isNonRetryable = error?.nonRetryable === true;
      const isRateLimit = error instanceof QuickBooksApiError && error.statusCode === 429;
      const isAuthError = error instanceof QuickBooksApiError && error.statusCode === 401;

      const isFinalAttempt = isNonRetryable || isAuthError || bullJob.attemptsMade >= (bullJob.opts?.attempts ?? 3) - 1;

      if (isFinalAttempt) {
        await this.jobService.markFailed(jobId, errorMessage, {
          stack: errorStack,
          attempt: bullJob.attemptsMade + 1,
          nonRetryable: isNonRetryable || isAuthError,
          statusCode: error instanceof QuickBooksApiError ? error.statusCode : undefined,
        });

        if (isAuthError) {
          // Mark integration as needing reconnection
          await this.prisma.integrationConfig.updateMany({
            where: { integrationId },
            data: {
              status: 'NEEDS_RECONNECT',
              lastErrorAt: new Date(),
              lastErrorMessage: 'QuickBooks authentication failed — please reconnect',
            },
          });
        }

        await this.events.emit(SALLY_EVENTS.ACCOUNTING_FAILED, tenantId, {
          entityId: jobId,
          entityType: 'accounting-sync',
          jobId,
          type,
          integrationId,
          error: errorMessage,
        });
      }

      this.logger.error(
        `Accounting job ${jobId} failed (attempt ${bullJob.attemptsMade + 1}${isRateLimit ? ', rate-limited' : ''}${isAuthError ? ', auth error' : ''}): ${errorMessage}`,
      );

      if (isNonRetryable || isAuthError) {
        return { success: false, error: errorMessage } as any;
      }

      if (isRateLimit) {
        // Delay retry by 30 seconds for rate limits (QB allows 500 req/min)
        await bullJob.moveToDelayed(Date.now() + 30_000, bullJob.token ?? '0');
        return {
          success: false,
          error: 'Rate limited — retrying after delay',
        } as any;
      }

      throw error; // Let Bull retry with standard backoff
    }
  }

  // ---------------------------------------------------------------------------
  // Webhook handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle a QB Payment webhook event.
   * Fetch payment details from QB, find the linked SALLY invoice, create Payment record.
   */
  private async handleWebhookPayment(tenantId: number, data: AccountingSyncJobData): Promise<AccountingSyncResult> {
    const webhookPayload = data.webhookPayload as {
      entityId: string;
      eventType: string;
      realmId: string;
    };

    const {
      adapter,
      accessToken: access_token,
      realmId: realm_id,
    } = await this.syncService.getAdapterAndToken(tenantId);

    const paymentDetail = await adapter.fetchPaymentDetail(access_token, realm_id, webhookPayload.entityId);

    if (!paymentDetail) {
      return { success: false, error: 'Payment not found in QB' };
    }

    // Find the SALLY invoice by externalInvoiceId
    for (const invoiceExternalId of paymentDetail.invoiceIds) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { externalInvoiceId: invoiceExternalId, tenantId },
      });

      if (!invoice) continue;

      // Idempotency check: skip if payment already synced
      const existing = await this.prisma.payment.findFirst({
        where: { externalPaymentId: webhookPayload.entityId, tenantId },
      });
      if (existing) {
        return { success: true, externalId: webhookPayload.entityId };
      }

      // Create the payment in SALLY
      const paymentId = `pmt_${nanoid(12)}`;

      await this.prisma.payment.create({
        data: {
          paymentId,
          invoiceId: invoice.id,
          tenantId,
          amountCents: Math.round(paymentDetail.amount * 100),
          paymentDate: new Date(paymentDetail.paymentDate),
          externalPaymentId: webhookPayload.entityId,
          externalSyncedAt: new Date(),
        },
      });

      return { success: true, externalId: webhookPayload.entityId };
    }

    return {
      success: false,
      error: 'No matching SALLY invoice found for QB payment',
    };
  }

  /**
   * Handle a QB BillPayment webhook event.
   * Mark the linked settlement as paid.
   */
  private async handleWebhookBillPayment(tenantId: number, data: AccountingSyncJobData): Promise<AccountingSyncResult> {
    const webhookPayload = data.webhookPayload as {
      entityId: string;
      eventType: string;
      realmId: string;
    };

    const {
      adapter,
      accessToken: access_token,
      realmId: realm_id,
    } = await this.syncService.getAdapterAndToken(tenantId);

    const billPaymentDetail = await adapter.fetchBillPaymentDetail(access_token, realm_id, webhookPayload.entityId);

    if (!billPaymentDetail) {
      return { success: false, error: 'Bill payment not found in QB' };
    }

    for (const billExternalId of billPaymentDetail.billIds) {
      const settlement = await this.prisma.settlement.findFirst({
        where: { externalBillId: billExternalId, tenantId },
      });

      if (!settlement) continue;

      await this.prisma.settlement.update({
        where: { id: settlement.id },
        data: {
          externalSyncedAt: new Date(),
          paidAt: settlement.paidAt ?? new Date(billPaymentDetail.paymentDate),
        },
      });

      return { success: true, externalId: webhookPayload.entityId };
    }

    return {
      success: false,
      error: 'No matching SALLY settlement found for QB bill payment',
    };
  }
}
