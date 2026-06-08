import { Test, TestingModule } from '@nestjs/testing';
import type { JobEnvelope } from '@sally/shared-types';
import { AccountingSyncJobHandler } from '../processors/accounting-sync-job.handler';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AccountingSyncService } from '../services/accounting-sync.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';

const mockJobService = {
  createJob: jest.fn().mockResolvedValue({ id: 'auto-job-1' }),
  markProcessing: jest.fn(),
  markCompleted: jest.fn(),
  markFailed: jest.fn(),
};

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  invoice: { findFirst: jest.fn() },
  payment: { findFirst: jest.fn(), create: jest.fn() },
  settlement: { findFirst: jest.fn(), update: jest.fn() },
  integrationConfig: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
};

const mockSyncService = {
  syncInvoice: jest.fn().mockResolvedValue({ success: true, externalId: 'qb-inv-1' }),
  syncSettlement: jest.fn().mockResolvedValue({ success: true, externalId: 'qb-bill-1' }),
  syncPayment: jest.fn().mockResolvedValue({ success: true, externalId: 'qb-pay-1' }),
  syncSettlementPayment: jest.fn().mockResolvedValue({ success: true, externalId: 'qb-bp-1' }),
  runInitialSync: jest.fn().mockResolvedValue({ success: true, details: { synced: 5 } }),
  getAdapterAndToken: jest.fn(),
};

const mockEventEmitter = { emit: jest.fn().mockResolvedValue(undefined) };

/**
 * Maps the AccountingSyncJobData.type to the FINANCE queue job name BullMQ
 * dispatches on. They coincide today (e.g. 'invoice' → FINANCE_JOB_NAMES.INVOICE)
 * but using the constant keeps the test robust if values drift.
 */
function jobNameForType(type: string): string {
  switch (type) {
    case 'invoice':
      return FINANCE_JOB_NAMES.INVOICE;
    case 'settlement':
      return FINANCE_JOB_NAMES.SETTLEMENT;
    case 'payment':
      return FINANCE_JOB_NAMES.PAYMENT;
    case 'settlement-payment':
      return FINANCE_JOB_NAMES.SETTLEMENT_PAYMENT;
    case 'webhook-payment':
      return FINANCE_JOB_NAMES.WEBHOOK_PAYMENT;
    case 'webhook-bill-payment':
      return FINANCE_JOB_NAMES.WEBHOOK_BILL_PAYMENT;
    case 'initial-sync':
      return FINANCE_JOB_NAMES.INITIAL_SYNC;
    // For the "unknown type" routing test — keep an owned job name so the
    // processor still enters the switch and throws BadRequestException.
    default:
      return FINANCE_JOB_NAMES.INVOICE;
  }
}

function createBullJob(data: any, overrides: Partial<{ attemptsMade: number; opts: any; name: string }> = {}) {
  const envelope: JobEnvelope<any> = {
    tenantId: String(data.tenantId ?? 'system'),
    correlationId: data.correlationId ?? 'corr-test',
    payload: data,
    metadata: {
      enqueuedAt: new Date().toISOString(),
      source: 'api',
      version: 1,
    },
  };
  return {
    data: envelope,
    name: overrides.name ?? jobNameForType(data.type),
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: overrides.opts ?? { attempts: 3 },
    ...overrides,
  } as any;
}

describe('AccountingSyncJobHandler', () => {
  let processor: AccountingSyncJobHandler;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingSyncJobHandler,
        { provide: JobService, useValue: mockJobService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountingSyncService, useValue: mockSyncService },
        { provide: DomainEventService, useValue: mockEventEmitter },
      ],
    }).compile();

    processor = module.get<AccountingSyncJobHandler>(AccountingSyncJobHandler);
  });

  // --------------------------------------------------------------------------
  // Job routing
  // --------------------------------------------------------------------------

  describe('process — job routing', () => {
    const baseData = {
      jobId: 'job-1',
      tenantId: 1,
      integrationId: 'int-1',
      triggerSource: 'manual' as const,
    };

    it('should process invoice sync', async () => {
      const job = createBullJob({
        ...baseData,
        type: 'invoice',
        entityId: 'inv-1',
      });

      const result = await processor.run(job);

      expect(mockSyncService.syncInvoice).toHaveBeenCalledWith(1, 'inv-1');
      expect((result as any).success).toBe(true);
      expect(mockJobService.markCompleted).toHaveBeenCalled();
    });

    it('should process settlement sync', async () => {
      const job = createBullJob({
        ...baseData,
        type: 'settlement',
        entityId: 'set-1',
      });

      await processor.run(job);

      expect(mockSyncService.syncSettlement).toHaveBeenCalledWith(1, 'set-1');
    });

    it('should process payment sync', async () => {
      const job = createBullJob({
        ...baseData,
        type: 'payment',
        entityId: 'pay-1',
      });

      await processor.run(job);

      expect(mockSyncService.syncPayment).toHaveBeenCalledWith(1, 'pay-1');
    });

    it('should process settlement-payment sync', async () => {
      const job = createBullJob({
        ...baseData,
        type: 'settlement-payment',
        entityId: 'sp-1',
      });

      await processor.run(job);

      expect(mockSyncService.syncSettlementPayment).toHaveBeenCalledWith(1, 'sp-1');
    });

    it('should process initial-sync', async () => {
      const job = createBullJob({ ...baseData, type: 'initial-sync' });

      await processor.run(job);

      expect(mockSyncService.runInitialSync).toHaveBeenCalledWith(1);
    });

    it('should throw for unknown job type', async () => {
      // Use an owned job name so the processor enters the switch; throws on default.
      const job = createBullJob({ ...baseData, type: 'unknown-type' });

      await expect(processor.run(job)).rejects.toThrow('Unknown accounting job type');
    });
  });

  // --------------------------------------------------------------------------
  // Skip paused tenants
  // --------------------------------------------------------------------------

  describe('process — tenant paused', () => {
    it('should skip processing when tenant jobs are paused', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: true });

      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'invoice',
        entityId: 'inv-1',
        triggerSource: 'manual',
      });

      const result = await processor.run(job);

      expect(result).toEqual(
        expect.objectContaining({
          recordsProcessed: 0,
        }),
      );
      expect(mockSyncService.syncInvoice).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Auto-create job when jobId is missing
  // --------------------------------------------------------------------------

  describe('process — auto-create job', () => {
    it('should create job when jobId not provided', async () => {
      const job = createBullJob({
        tenantId: 1,
        integrationId: 'int-1',
        type: 'invoice',
        entityId: 'inv-1',
        triggerSource: 'scheduled',
        // no jobId
      });

      await processor.run(job);

      expect(mockJobService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          category: 'finance',
          type: 'invoice',
        }),
      );
      expect(mockJobService.markProcessing).toHaveBeenCalledWith('auto-job-1');
    });
  });

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  describe('process — events', () => {
    it('should emit ACCOUNTING_STARTED and ACCOUNTING_COMPLETED events', async () => {
      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'invoice',
        entityId: 'inv-1',
        triggerSource: 'manual',
      });

      await processor.run(job);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ACCOUNTING_STARTED,
        expect.any(Number),
        expect.objectContaining({ jobId: 'job-1', type: 'invoice' }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ACCOUNTING_COMPLETED,
        expect.any(Number),
        expect.objectContaining({ jobId: 'job-1', type: 'invoice' }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe('process — error handling', () => {
    it('should mark failed and emit event on final attempt', async () => {
      mockSyncService.syncInvoice.mockRejectedValue(new Error('QB API error'));

      const job = createBullJob(
        {
          jobId: 'job-1',
          tenantId: 1,
          integrationId: 'int-1',
          type: 'invoice',
          entityId: 'inv-1',
          triggerSource: 'manual',
        },
        { attemptsMade: 2, opts: { attempts: 3 } },
      );

      await expect(processor.run(job)).rejects.toThrow('QB API error');

      expect(mockJobService.markFailed).toHaveBeenCalledWith('job-1', 'QB API error', expect.anything());
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ACCOUNTING_FAILED,
        expect.any(Number),
        expect.objectContaining({ jobId: 'job-1', error: 'QB API error' }),
      );
    });

    it('should not mark failed on non-final attempt', async () => {
      mockSyncService.syncInvoice.mockRejectedValue(new Error('temporary error'));

      const job = createBullJob(
        {
          jobId: 'job-1',
          tenantId: 1,
          integrationId: 'int-1',
          type: 'invoice',
          entityId: 'inv-1',
          triggerSource: 'manual',
        },
        { attemptsMade: 0, opts: { attempts: 3 } },
      );

      await expect(processor.run(job)).rejects.toThrow();

      expect(mockJobService.markFailed).not.toHaveBeenCalled();
    });

    it('should return resolved result (not throw) for non-retryable errors', async () => {
      const err = new Error('Reconnect required');
      (err as any).nonRetryable = true;
      mockSyncService.syncInvoice.mockRejectedValue(err);

      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'invoice',
        entityId: 'inv-1',
        triggerSource: 'manual',
      });

      const result = await processor.run(job);

      expect(result).toEqual(expect.objectContaining({ success: false }));
      expect(mockJobService.markFailed).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Webhook handlers
  // --------------------------------------------------------------------------

  describe('process — webhook-payment', () => {
    it('should handle webhook-payment and create payment record', async () => {
      mockSyncService.getAdapterAndToken.mockResolvedValue({
        adapter: {
          fetchPaymentDetail: jest.fn().mockResolvedValue({
            invoiceIds: ['qb-inv-1'],
            amount: 1500.0,
            paymentDate: '2026-03-01',
          }),
        },
        accessToken: 'at',
        realmId: 'realm-1',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 10,
        tenantId: 1,
      });
      mockPrisma.payment.findFirst.mockResolvedValue(null); // no existing
      mockPrisma.payment.create.mockResolvedValue({});

      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'webhook-payment',
        triggerSource: 'webhook',
        webhookPayload: {
          entityId: 'qb-pay-1',
          eventType: 'Payment',
          realmId: 'realm-1',
        },
      });

      const result = await processor.run(job);

      expect((result as any).success).toBe(true);
      expect(mockPrisma.payment.create).toHaveBeenCalled();
    });

    it('should skip if payment already synced (idempotency)', async () => {
      mockSyncService.getAdapterAndToken.mockResolvedValue({
        adapter: {
          fetchPaymentDetail: jest.fn().mockResolvedValue({
            invoiceIds: ['qb-inv-1'],
            amount: 1500.0,
            paymentDate: '2026-03-01',
          }),
        },
        accessToken: 'at',
        realmId: 'r',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: 10,
        tenantId: 1,
      });
      mockPrisma.payment.findFirst.mockResolvedValue({ id: 1 }); // already exists

      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'webhook-payment',
        triggerSource: 'webhook',
        webhookPayload: {
          entityId: 'qb-pay-1',
          eventType: 'Payment',
          realmId: 'r',
        },
      });

      const result = await processor.run(job);

      expect((result as any).success).toBe(true);
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });

    it('should return error if payment not found in QB', async () => {
      mockSyncService.getAdapterAndToken.mockResolvedValue({
        adapter: {
          fetchPaymentDetail: jest.fn().mockResolvedValue(null),
        },
        accessToken: 'at',
        realmId: 'r',
      });

      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'webhook-payment',
        triggerSource: 'webhook',
        webhookPayload: {
          entityId: 'missing',
          eventType: 'Payment',
          realmId: 'r',
        },
      });

      const result = await processor.run(job);

      expect((result as any).success).toBe(false);
      expect((result as any).error).toContain('not found');
    });
  });

  describe('process — webhook-bill-payment', () => {
    it('should handle webhook-bill-payment and update settlement', async () => {
      mockSyncService.getAdapterAndToken.mockResolvedValue({
        adapter: {
          fetchBillPaymentDetail: jest.fn().mockResolvedValue({
            billIds: ['qb-bill-1'],
            amount: 2000.0,
            paymentDate: '2026-03-05',
          }),
        },
        accessToken: 'at',
        realmId: 'r',
      });
      mockPrisma.settlement.findFirst.mockResolvedValue({
        id: 5,
        tenantId: 1,
        paidAt: null,
      });
      mockPrisma.settlement.update.mockResolvedValue({});

      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'webhook-bill-payment',
        triggerSource: 'webhook',
        webhookPayload: {
          entityId: 'qb-bp-1',
          eventType: 'BillPayment',
          realmId: 'r',
        },
      });

      const result = await processor.run(job);

      expect((result as any).success).toBe(true);
      expect(mockPrisma.settlement.update).toHaveBeenCalled();
    });

    it('should return error if bill payment not found in QB', async () => {
      mockSyncService.getAdapterAndToken.mockResolvedValue({
        adapter: {
          fetchBillPaymentDetail: jest.fn().mockResolvedValue(null),
        },
        accessToken: 'at',
        realmId: 'r',
      });

      const job = createBullJob({
        jobId: 'job-1',
        tenantId: 1,
        integrationId: 'int-1',
        type: 'webhook-bill-payment',
        triggerSource: 'webhook',
        webhookPayload: {
          entityId: 'missing',
          eventType: 'BillPayment',
          realmId: 'r',
        },
      });

      const result = await processor.run(job);

      expect((result as any).success).toBe(false);
    });
  });
});
