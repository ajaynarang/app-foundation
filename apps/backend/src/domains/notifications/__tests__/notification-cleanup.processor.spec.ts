import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { NotificationJobsHandler } from '../notification-cleanup.processor';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NotificationTriggersService } from '../notification-triggers.service';
import { NOTIFICATIONS_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';

function makeEnvelope<P>(payload: P): JobEnvelope<P> {
  return {
    tenantId: 'system',
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'cron', version: 1 },
  };
}

function makeJob(name: string, opts?: { attemptsMade?: number; attempts?: number }): Job<JobEnvelope<unknown>> {
  return {
    id: 'j1',
    name,
    data: makeEnvelope({}),
    attemptsMade: opts?.attemptsMade ?? 0,
    opts: { attempts: opts?.attempts ?? 1 },
  } as unknown as Job<JobEnvelope<unknown>>;
}

describe('NotificationJobsHandler', () => {
  let handler: NotificationJobsHandler;
  let prisma: any;
  let notificationTriggers: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
      driver: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    notificationTriggers = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NotificationJobsHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationTriggersService, useValue: notificationTriggers },
      ],
    }).compile();

    handler = module.get(NotificationJobsHandler);
  });

  it('should delete dismissed notifications older than 7 days', async () => {
    const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.CLEANUP));
    expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ dismissed: 5, read: 5 });
  });

  it('should check document expiry for active drivers', async () => {
    const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY));
    expect(prisma.driver.findMany).toHaveBeenCalled();
    expect(result).toEqual({ driversChecked: 0, notificationsSent: 0 });
  });

  it('should check overdue invoices', async () => {
    const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.INVOICE_OVERDUE));
    expect(prisma.invoice.findMany).toHaveBeenCalled();
    expect(result).toEqual({ overdueInvoices: 0, notificationsSent: 0 });
  });

  describe('document-expiry with drivers', () => {
    it('should send notification for expiring medical card within 7 days', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 5);

      prisma.driver.findMany.mockResolvedValue([{ id: 1, tenantId: 1, medicalCardExpiry: expiryDate }]);
      prisma.user.findFirst.mockResolvedValue({ id: 10 });
      prisma.notification.findFirst.mockResolvedValue(null);

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY));

      expect(notificationTriggers.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DOCUMENT_EXPIRING_SOON',
          title: 'Medical Card Expiring Soon',
          recipientUserIds: [10],
        }),
      );
      expect((result as any).notificationsSent).toBe(1);
    });

    it('should skip driver without associated user', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 10);

      prisma.driver.findMany.mockResolvedValue([{ id: 1, tenantId: 1, medicalCardExpiry: expiryDate }]);
      prisma.user.findFirst.mockResolvedValue(null);

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY));

      expect(notificationTriggers.trigger).not.toHaveBeenCalled();
      expect((result as any).notificationsSent).toBe(0);
    });

    it('should skip if notification already sent within threshold', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 5);

      prisma.driver.findMany.mockResolvedValue([{ id: 1, tenantId: 1, medicalCardExpiry: expiryDate }]);
      prisma.user.findFirst.mockResolvedValue({ id: 10 });
      prisma.notification.findFirst.mockResolvedValue({
        id: 99,
        type: 'DOCUMENT_EXPIRING_SOON',
      });

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY));

      expect(notificationTriggers.trigger).not.toHaveBeenCalled();
      expect((result as any).notificationsSent).toBe(0);
    });

    it('should use 14-day threshold for cards expiring in 10-14 days', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 12);

      prisma.driver.findMany.mockResolvedValue([{ id: 1, tenantId: 1, medicalCardExpiry: expiryDate }]);
      prisma.user.findFirst.mockResolvedValue({ id: 10 });
      prisma.notification.findFirst.mockResolvedValue(null);

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY));

      expect(notificationTriggers.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ threshold: 14 }),
        }),
      );
      expect((result as any).notificationsSent).toBe(1);
    });

    it('should use 30-day threshold for cards expiring in 15-30 days', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 25);

      prisma.driver.findMany.mockResolvedValue([{ id: 1, tenantId: 1, medicalCardExpiry: expiryDate }]);
      prisma.user.findFirst.mockResolvedValue({ id: 10 });
      prisma.notification.findFirst.mockResolvedValue(null);

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.DOCUMENT_EXPIRY));

      expect(notificationTriggers.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ threshold: 30 }),
        }),
      );
      expect((result as any).notificationsSent).toBe(1);
    });
  });

  describe('invoice-overdue with invoices', () => {
    it('should send notification for overdue invoice', async () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 5);

      prisma.invoice.findMany.mockResolvedValue([
        {
          invoiceNumber: 'INV-001',
          tenantId: 1,
          customerId: 10,
          dueDate: pastDue,
        },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null);
      prisma.customer = {
        findUnique: jest.fn().mockResolvedValue({ companyName: 'Acme Corp' }),
      };

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.INVOICE_OVERDUE));

      expect(notificationTriggers.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INVOICE_OVERDUE',
          category: 'BILLING',
          title: 'Invoice INV-001 Overdue',
        }),
      );
      expect((result as any).notificationsSent).toBe(1);
    });

    it('should skip if notification already sent within 24 hours', async () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 3);

      prisma.invoice.findMany.mockResolvedValue([
        {
          invoiceNumber: 'INV-001',
          tenantId: 1,
          customerId: null,
          dueDate: pastDue,
        },
      ]);
      prisma.notification.findFirst.mockResolvedValue({
        id: 99,
        type: 'INVOICE_OVERDUE',
      });

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.INVOICE_OVERDUE));

      expect(notificationTriggers.trigger).not.toHaveBeenCalled();
      expect((result as any).notificationsSent).toBe(0);
    });

    it('should use default customer name when customerId is null', async () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 2);

      prisma.invoice.findMany.mockResolvedValue([
        {
          invoiceNumber: 'INV-002',
          tenantId: 1,
          customerId: null,
          dueDate: pastDue,
        },
      ]);
      prisma.notification.findFirst.mockResolvedValue(null);

      const result = await handler.run(makeJob(NOTIFICATIONS_JOB_NAMES.INVOICE_OVERDUE));

      expect(notificationTriggers.trigger).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Customer'),
        }),
      );
      expect((result as any).notificationsSent).toBe(1);
    });
  });
});
