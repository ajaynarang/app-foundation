import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { PaymentsService } from '../payments.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '../../../../../infrastructure/queue/queue.constants';
import { NotificationTriggersService } from '../../../../../domains/operations/notifications/notification-triggers.service';
import { createMockPrisma, createMockQueue } from '../../../../../test/mocks';
import { makeInvoice, makeCustomer, makePayment } from '../../../../../test/factories';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let accountingQueue: ReturnType<typeof createMockQueue>;
  let notificationTriggers: Record<string, jest.Mock>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    accountingQueue = createMockQueue();
    notificationTriggers = {
      paymentReceived: jest.fn().mockResolvedValue(undefined),
      customerPaymentConfirmed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: getQueueToken(QUEUE_NAMES.FINANCE),
          useValue: accountingQueue,
        },
        {
          provide: NotificationTriggersService,
          useValue: notificationTriggers,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  const tenantId = 1;
  const invoiceId = 'inv-test-001';

  const basePaymentData = {
    amountCents: 100000,
    paymentMethod: 'ACH',
    referenceNumber: 'REF-001',
    paymentDate: '2026-03-15',
  };

  // ─── recordPayment ──────────────────────────────────────────

  describe('recordPayment', () => {
    it('should create payment and update invoice to PARTIAL when partially paid', async () => {
      const invoice = makeInvoice({
        invoiceNumber: invoiceId,
        status: 'SENT',
        totalCents: 250000,
        paidCents: 0,
        balanceCents: 250000,
        customerId: 1,
        customer: makeCustomer(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      const newPayment = makePayment({ amountCents: 100000 });
      // $transaction returns [payment, isNewPayment]
      prisma.$transaction.mockImplementation(async (cb: (...args: any[]) => any) => {
        // Simulate the transaction callback
        prisma.payment.findFirst.mockResolvedValue(null); // no duplicate
        prisma.payment.create.mockResolvedValue(newPayment);
        prisma.invoice.update.mockResolvedValue({});
        return cb(prisma);
      });

      await service.recordPayment(tenantId, invoiceId, basePaymentData);

      // Verify payment creation
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amountCents: 100000,
            invoiceId: invoice.id,
          }),
        }),
      );

      // Verify invoice update with PARTIAL status
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidCents: 100000,
            balanceCents: 150000,
            status: 'PARTIAL',
            paidDate: null,
          }),
        }),
      );
    });

    it('should set invoice to PAID when fully paid (balance reaches 0)', async () => {
      const invoice = makeInvoice({
        invoiceNumber: invoiceId,
        status: 'SENT',
        totalCents: 250000,
        paidCents: 0,
        balanceCents: 250000,
        customerId: 1,
        customer: makeCustomer(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      prisma.$transaction.mockImplementation(async (cb: (...args: any[]) => any) => {
        prisma.payment.findFirst.mockResolvedValue(null);
        prisma.payment.create.mockResolvedValue(makePayment({ amountCents: 250000 }));
        prisma.invoice.update.mockResolvedValue({});
        return cb(prisma);
      });

      await service.recordPayment(tenantId, invoiceId, {
        ...basePaymentData,
        amountCents: 250000,
      });

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidCents: 250000,
            balanceCents: 0,
            status: 'PAID',
            paidDate: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw NotFoundException when invoice not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(service.recordPayment(tenantId, 'nonexistent', basePaymentData)).rejects.toThrow(NotFoundException);
    });

    it('should throw when invoice is VOID', async () => {
      prisma.invoice.findFirst.mockResolvedValue(makeInvoice({ invoiceNumber: invoiceId, status: 'VOID' }));

      await expect(service.recordPayment(tenantId, invoiceId, basePaymentData)).rejects.toThrow(
        'Cannot record payment on voided invoice',
      );
    });

    it('should throw when invoice is already PAID', async () => {
      prisma.invoice.findFirst.mockResolvedValue(makeInvoice({ invoiceNumber: invoiceId, status: 'PAID' }));

      await expect(service.recordPayment(tenantId, invoiceId, basePaymentData)).rejects.toThrow(
        'Invoice is already fully paid',
      );
    });

    it('should throw when payment exceeds balance', async () => {
      prisma.invoice.findFirst.mockResolvedValue(
        makeInvoice({ invoiceNumber: invoiceId, status: 'SENT', balanceCents: 50000 }),
      );

      await expect(
        service.recordPayment(tenantId, invoiceId, {
          ...basePaymentData,
          amountCents: 100000,
        }),
      ).rejects.toThrow(/Payment amount.*exceeds balance/);
    });

    it('should trigger notifications on new payment', async () => {
      const invoice = makeInvoice({
        invoiceNumber: 'INV-2026-0001',
        status: 'SENT',
        totalCents: 250000,
        paidCents: 0,
        balanceCents: 250000,
        customerId: 1,
        customer: makeCustomer(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      const newPayment = makePayment();
      prisma.$transaction.mockImplementation(async (cb: (...args: any[]) => any) => {
        prisma.payment.findFirst.mockResolvedValue(null);
        prisma.payment.create.mockResolvedValue(newPayment);
        prisma.invoice.update.mockResolvedValue({});
        return cb(prisma);
      });

      await service.recordPayment(tenantId, invoiceId, basePaymentData);

      expect(notificationTriggers.paymentReceived).toHaveBeenCalledWith(
        tenantId,
        'INV-2026-0001',
        expect.any(String),
        expect.any(String),
      );
    });

    it('should return existing payment for idempotent duplicate (same reference number)', async () => {
      const invoice = makeInvoice({
        invoiceNumber: invoiceId,
        status: 'SENT',
        totalCents: 250000,
        paidCents: 0,
        balanceCents: 250000,
        customer: makeCustomer(),
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      const existingPayment = makePayment({ paymentId: 'pay-existing' });
      prisma.$transaction.mockImplementation(async (cb: (...args: any[]) => any) => {
        prisma.payment.findFirst.mockResolvedValue(existingPayment);
        return cb(prisma);
      });

      const result = await service.recordPayment(tenantId, invoiceId, basePaymentData);

      expect(result.paymentId).toBe('pay-existing');
      // Should NOT create a new payment
      expect(prisma.payment.create).not.toHaveBeenCalled();
      // Should NOT trigger notifications for idempotent return
      expect(notificationTriggers.paymentReceived).not.toHaveBeenCalled();
    });

    it('should queue accounting sync when invoice has externalInvoiceId', async () => {
      const invoice = makeInvoice({
        invoiceNumber: invoiceId,
        status: 'SENT',
        totalCents: 250000,
        paidCents: 0,
        balanceCents: 250000,
        customerId: 1,
        customer: makeCustomer(),
        externalInvoiceId: 'qb-inv-123',
      });
      prisma.invoice.findFirst.mockResolvedValue(invoice);

      const newPayment = makePayment({ paymentId: 'pay-new' });
      prisma.$transaction.mockImplementation(async (cb: (...args: any[]) => any) => {
        prisma.payment.findFirst.mockResolvedValue(null);
        prisma.payment.create.mockResolvedValue(newPayment);
        prisma.invoice.update.mockResolvedValue({});
        return cb(prisma);
      });

      prisma.integrationConfig.findFirst.mockResolvedValue({
        integrationId: 'int-1',
        isEnabled: true,
        status: 'ACTIVE',
      });

      await service.recordPayment(tenantId, invoiceId, basePaymentData);

      expect(accountingQueue.add).toHaveBeenCalledWith(
        'payment',
        expect.objectContaining({
          payload: expect.objectContaining({
            entityId: 'pay-new',
            type: 'payment',
          }),
          metadata: expect.objectContaining({ source: 'api' }),
        }),
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });
});
