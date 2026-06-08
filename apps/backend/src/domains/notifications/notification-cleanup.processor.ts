import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { NOTIFICATIONS_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';
import { NotificationTriggersService } from './notification-triggers.service';

/**
 * NotificationJobsProcessor handles the housekeeping cron sweeps on the shared
 * NOTIFICATIONS queue.
 *
 * Owned job names:
 *   - CLEANUP           — purge old read / dismissed in-app notifications
 *   - DOCUMENT_EXPIRY   — notify drivers of expiring medical cards
 *   - INVOICE_OVERDUE   — notify staff of overdue invoices
 *
 * The sibling `AlertNotificationsProcessor` owns the alert-* + shift-summary
 * job names on this same queue — foreign job names are short-circuited here.
 */
/**
 * Owns the housekeeping cron sweeps on the `notifications` queue (CLEANUP,
 * DOCUMENT_EXPIRY, INVOICE_OVERDUE). A plain handler — the single
 * NotificationsQueueProcessor dispatcher routes by name; the sibling
 * AlertNotificationsJobHandler owns the alert-* + shift-summary names.
 */
@Injectable()
export class NotificationJobsHandler implements QueueJobHandler {
  readonly jobNames = [
    NOTIFICATIONS_JOB_NAMES.CLEANUP,
    NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY,
    NOTIFICATIONS_JOB_NAMES.INVOICE_OVERDUE,
  ];
  private readonly logger = new Logger(NotificationJobsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  async run(job: Job<JobEnvelope<unknown>>): Promise<unknown> {
    switch (job.name) {
      case NOTIFICATIONS_JOB_NAMES.CLEANUP:
        return this.runCleanup();
      case NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY:
        return this.checkDocumentExpiry();
      case NOTIFICATIONS_JOB_NAMES.INVOICE_OVERDUE:
        return this.checkOverdueInvoices();
      default:
        return;
    }
  }

  private async runCleanup() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dismissed = await this.prisma.notification.deleteMany({
      where: {
        dismissedAt: { not: null, lt: sevenDaysAgo },
      },
    });

    const read = await this.prisma.notification.deleteMany({
      where: {
        readAt: { not: null, lt: thirtyDaysAgo },
        dismissedAt: null,
      },
    });

    this.logger.log(`Cleanup complete: ${dismissed.count} dismissed, ${read.count} read notifications deleted`);
    return { dismissed: dismissed.count, read: read.count };
  }

  private async checkDocumentExpiry() {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Only medicalCardExpiry exists in the Driver model
    const drivers = await this.prisma.driver.findMany({
      where: {
        status: 'ACTIVE',
        medicalCardExpiry: { lte: thirtyDaysFromNow, gte: now },
      },
      select: {
        id: true,
        tenantId: true,
        medicalCardExpiry: true,
      },
    });

    let notified = 0;

    for (const driver of drivers) {
      // Find the user associated with this driver
      const driverUser = await this.prisma.user.findFirst({
        where: { driverId: driver.id, isActive: true },
        select: { id: true },
      });
      if (!driverUser) continue;

      if (!driver.medicalCardExpiry) continue;

      const daysUntil = Math.ceil((driver.medicalCardExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      let threshold: number;
      if (daysUntil <= 7) threshold = 7;
      else if (daysUntil <= 14) threshold = 14;
      else threshold = 30;

      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: driverUser.id,
          type: 'DOCUMENT_EXPIRING_SOON',
          metadata: { path: ['docType'], equals: 'Medical Card' },
          createdAt: {
            gte: new Date(now.getTime() - threshold * 24 * 60 * 60 * 1000),
          },
        },
      });

      if (!existing) {
        await this.notificationTriggers.trigger({
          tenantId: driver.tenantId,
          type: 'DOCUMENT_EXPIRING_SOON' as any,
          category: 'SYSTEM',
          title: 'Medical Card Expiring Soon',
          message: `Your medical card expires in ${daysUntil} days`,
          iconType: 'document',
          metadata: {
            docType: 'Medical Card',
            expiryDate: driver.medicalCardExpiry.toISOString(),
            threshold,
          },
          recipientUserIds: [driverUser.id],
        });
        notified++;
      }
    }

    this.logger.log(`Document expiry check complete: ${notified} notifications sent`);
    return { driversChecked: drivers.length, notificationsSent: notified };
  }

  private async checkOverdueInvoices() {
    const now = new Date();

    // Use select instead of include to get exactly what we need
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: 'SENT',
        dueDate: { lt: now },
      },
      select: {
        invoiceNumber: true,
        tenantId: true,
        customerId: true,
        dueDate: true,
      },
    });

    let notified = 0;
    for (const invoice of overdueInvoices) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          type: 'INVOICE_OVERDUE',
          tenantId: invoice.tenantId,
          metadata: { path: ['invoiceNumber'], equals: invoice.invoiceNumber },
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });
      if (existing) continue;

      // Get customer name
      let customerName = 'Customer';
      if (invoice.customerId) {
        const customer = await this.prisma.customer.findUnique({
          where: { id: invoice.customerId },
          select: { companyName: true },
        });
        if (customer) customerName = customer.companyName;
      }

      const daysOverdue = Math.ceil((now.getTime() - invoice.dueDate.getTime()) / (24 * 60 * 60 * 1000));
      await this.notificationTriggers.trigger({
        tenantId: invoice.tenantId,
        type: 'INVOICE_OVERDUE' as any,
        category: 'BILLING',
        title: `Invoice ${invoice.invoiceNumber} Overdue`,
        message: `${daysOverdue} days overdue — ${customerName}`,
        actionUrl: '/dispatcher/billing',
        actionLabel: 'View Billing',
        iconType: 'billing',
        metadata: { invoiceNumber: invoice.invoiceNumber, daysOverdue },
        recipientRoles: ['OWNER', 'ADMIN', 'DISPATCHER'],
      });
      notified++;
    }

    this.logger.log(`Invoice overdue check complete: ${notified} notifications sent`);
    return {
      overdueInvoices: overdueInvoices.length,
      notificationsSent: notified,
    };
  }
}
