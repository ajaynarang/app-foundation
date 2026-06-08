import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { AccountingWebhookController } from '../controllers/accounting-webhook.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { QUEUE_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { QuickBooksAdapter } from '../vendors/quickbooks/quickbooks.adapter';

const mockPrisma = {
  integrationConfig: { findFirst: jest.fn() },
};

const mockJobService = {
  createJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockAccountingQueue = { add: jest.fn() };

const mockQbAdapter = {
  validateWebhookSignature: jest.fn(),
  parseWebhookEvents: jest.fn().mockReturnValue([]),
};

const mockConfig = {
  get: jest.fn((key: string, fallback?: string) => {
    if (key === 'QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN') return 'test-secret';
    return fallback ?? '';
  }),
};

describe('AccountingWebhookController', () => {
  let controller: AccountingWebhookController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingWebhookController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JobService, useValue: mockJobService },
        { provide: QuickBooksAdapter, useValue: mockQbAdapter },
        { provide: ConfigService, useValue: mockConfig },
        {
          provide: getQueueToken(QUEUE_NAMES.FINANCE),
          useValue: mockAccountingQueue,
        },
      ],
    }).compile();

    controller = module.get<AccountingWebhookController>(AccountingWebhookController);
  });

  // --------------------------------------------------------------------------
  // Signature validation
  // --------------------------------------------------------------------------

  describe('handleWebhook — signature validation', () => {
    it('should return received:true if no rawBody', async () => {
      const req = { rawBody: undefined };
      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
    });

    it('should throw if verifier token is not configured', async () => {
      mockConfig.get.mockReturnValueOnce(''); // no verifier token
      const req = { rawBody: Buffer.from('{}') };

      await expect(controller.handleWebhook('sig', req)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if signature header is missing', async () => {
      const req = { rawBody: Buffer.from('{}') };

      await expect(controller.handleWebhook(undefined as any, req)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if signature is invalid', async () => {
      mockQbAdapter.validateWebhookSignature.mockReturnValue(false);
      const req = { rawBody: Buffer.from('{}') };

      await expect(controller.handleWebhook('bad-sig', req)).rejects.toThrow(UnauthorizedException);
    });
  });

  // --------------------------------------------------------------------------
  // Event processing
  // --------------------------------------------------------------------------

  describe('handleWebhook — event processing', () => {
    beforeEach(() => {
      mockQbAdapter.validateWebhookSignature.mockReturnValue(true);
    });

    it('should return received:true for valid webhook with no events', async () => {
      const req = { rawBody: Buffer.from('{}') };
      mockQbAdapter.parseWebhookEvents.mockReturnValue([]);

      const result = await controller.handleWebhook('valid-sig', req);

      expect(result).toEqual({ received: true });
      expect(mockAccountingQueue.add).not.toHaveBeenCalled();
    });

    it('should queue Payment Create event', async () => {
      mockQbAdapter.parseWebhookEvents.mockReturnValue([
        {
          eventType: 'Payment',
          operation: 'Create',
          entityId: 'pay-1',
          realmId: 'realm-1',
        },
      ]);
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        tenantId: 1,
        integrationId: 'int-1',
      });

      const req = { rawBody: Buffer.from('{}') };
      await controller.handleWebhook('sig', req);

      expect(mockAccountingQueue.add).toHaveBeenCalledWith(
        'webhook-payment',
        expect.objectContaining({
          tenantId: '1',
          payload: expect.objectContaining({
            tenantId: 1,
            type: 'webhook-payment',
            webhookPayload: expect.objectContaining({ entityId: 'pay-1' }),
          }),
          metadata: expect.objectContaining({ source: 'webhook' }),
        }),
      );
    });

    it('should queue BillPayment Update event', async () => {
      mockQbAdapter.parseWebhookEvents.mockReturnValue([
        {
          eventType: 'BillPayment',
          operation: 'Update',
          entityId: 'bp-1',
          realmId: 'realm-1',
        },
      ]);
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        tenantId: 1,
        integrationId: 'int-1',
      });

      const req = { rawBody: Buffer.from('{}') };
      await controller.handleWebhook('sig', req);

      expect(mockAccountingQueue.add).toHaveBeenCalledWith(
        'webhook-bill-payment',
        expect.objectContaining({
          payload: expect.objectContaining({ type: 'webhook-bill-payment' }),
          metadata: expect.objectContaining({ source: 'webhook' }),
        }),
      );
    });

    it('should skip Delete operation events', async () => {
      mockQbAdapter.parseWebhookEvents.mockReturnValue([
        {
          eventType: 'Payment',
          operation: 'Delete',
          entityId: 'pay-1',
          realmId: 'realm-1',
        },
      ]);

      const req = { rawBody: Buffer.from('{}') };
      await controller.handleWebhook('sig', req);

      expect(mockAccountingQueue.add).not.toHaveBeenCalled();
    });

    it('should skip Invoice events (only Payment/BillPayment)', async () => {
      mockQbAdapter.parseWebhookEvents.mockReturnValue([
        {
          eventType: 'Invoice',
          operation: 'Create',
          entityId: 'inv-1',
          realmId: 'realm-1',
        },
      ]);

      const req = { rawBody: Buffer.from('{}') };
      await controller.handleWebhook('sig', req);

      expect(mockAccountingQueue.add).not.toHaveBeenCalled();
    });

    it('should skip events with no matching integration config', async () => {
      mockQbAdapter.parseWebhookEvents.mockReturnValue([
        {
          eventType: 'Payment',
          operation: 'Create',
          entityId: 'pay-1',
          realmId: 'unknown-realm',
        },
      ]);
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);

      const req = { rawBody: Buffer.from('{}') };
      await controller.handleWebhook('sig', req);

      expect(mockAccountingQueue.add).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON in body', async () => {
      const req = { rawBody: Buffer.from('not json') };

      const result = await controller.handleWebhook('sig', req);

      expect(result).toEqual({ received: true });
    });
  });
});
