import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { QUEUE_NAMES, FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';
import { randomUUID } from 'crypto';
import { NotificationTriggersService } from '../../../../domains/operations/notifications/notification-triggers.service';
import { requestContextStorage } from '../../../../infrastructure/logging/request-context.middleware';
import type { AccountingSyncJobData } from '../../../integrations/accounting/accounting-job.types';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.FINANCE)
    private readonly financeQueue: Queue,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  async recordPayment(
    tenantId: number,
    invoiceNumber: string,
    data: {
      amountCents: number;
      paymentMethod?: string;
      referenceNumber?: string;
      paymentDate: string;
      notes?: string;
    },
    userId?: number,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      include: { customer: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') throw new BadRequestException('Cannot record payment on voided invoice');
    if (invoice.status === 'PAID') throw new BadRequestException('Invoice is already fully paid');

    // Interactive transaction: idempotency check + create payment + update invoice
    // all within a single transaction to prevent race conditions on concurrent requests
    const [payment, isNewPayment] = await this.prisma.$transaction(async (tx) => {
      // Idempotency check INSIDE transaction to prevent duplicate payments
      if (data.referenceNumber) {
        const existingPayment = await tx.payment.findFirst({
          where: {
            tenantId,
            referenceNumber: data.referenceNumber,
            invoiceId: invoice.id,
          },
        });
        if (existingPayment) {
          this.logger.log(
            `Idempotent return: payment ${existingPayment.paymentId} already exists (ref: ${data.referenceNumber})`,
          );
          return [existingPayment, false] as const;
        }
      }

      // Re-fetch invoice inside transaction to prevent race condition on concurrent payments
      const freshInvoice = await tx.invoice.findFirst({
        where: { id: invoice.id, tenantId },
      });
      if (!freshInvoice) throw new NotFoundException('Invoice not found');

      if (data.amountCents > freshInvoice.balanceCents) {
        throw new BadRequestException(
          `Payment amount ($${(data.amountCents / 100).toFixed(2)}) exceeds balance ($${(freshInvoice.balanceCents / 100).toFixed(2)})`,
        );
      }

      const newPaidCents = freshInvoice.paidCents + data.amountCents;
      const newBalanceCents = freshInvoice.totalCents - newPaidCents;
      const newStatus = newBalanceCents <= 0 ? 'PAID' : 'PARTIAL';

      const newPayment = await tx.payment.create({
        data: {
          paymentId: `pay_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          invoiceId: invoice.id,
          amountCents: data.amountCents,
          paymentMethod: data.paymentMethod || null,
          referenceNumber: data.referenceNumber || null,
          paymentDate: new Date(data.paymentDate),
          notes: data.notes || null,
          tenantId,
          createdBy: userId || null,
        },
      });

      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidCents: newPaidCents,
          balanceCents: newBalanceCents,
          status: newStatus,
          paidDate: newStatus === 'PAID' ? new Date() : null,
        },
      });

      return [newPayment, true] as const;
    });

    // Only trigger side effects for newly created payments (skip for idempotent returns)
    if (isNewPayment) {
      this.logger.log(
        `Recorded payment of $${(data.amountCents / 100).toFixed(2)} on invoice ${invoice.invoiceNumber}`,
      );

      this.notificationTriggers
        .paymentReceived(
          tenantId,
          invoice.invoiceNumber,
          `$${(data.amountCents / 100).toFixed(2)}`,
          invoice.customer?.companyName ?? 'Customer',
        )
        .catch(() => {});
      if (invoice.customerId) {
        this.notificationTriggers
          .customerPaymentConfirmed(
            tenantId,
            invoice.customerId,
            invoice.invoiceNumber,
            `$${(data.amountCents / 100).toFixed(2)}`,
          )
          .catch(() => {});
      }

      // Auto-sync payment to QB if the invoice is already synced
      if (invoice.externalInvoiceId) {
        const config = await this.prisma.integrationConfig.findFirst({
          where: {
            tenantId,
            integrationType: 'ACCOUNTING',
            isEnabled: true,
            status: 'ACTIVE',
          },
        });

        if (config) {
          const correlationId = requestContextStorage.getStore()?.requestId;
          const payload: AccountingSyncJobData = {
            tenantId,
            integrationId: config.integrationId,
            type: 'payment',
            entityId: payment.paymentId,
            triggerSource: 'manual',
            correlationId,
          };
          await this.financeQueue.add(
            FINANCE_JOB_NAMES.PAYMENT,
            buildJobEnvelope(payload, {
              tenantId: String(tenantId),
              source: 'api',
              correlationId,
            }),
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
            },
          );
          this.logger.log(`Queued payment ${payment.paymentId} for QB sync (invoice already synced)`);
        }
      }
    }

    return payment;
  }
}
