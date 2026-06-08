import { Test, TestingModule } from '@nestjs/testing';
import { TenderExpiryJobHandler } from '../tender-expiry.processor';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { VendorCircuitBreakerService } from '../../../../../infrastructure/queue/vendor-circuit-breaker.service';
import { VENDOR_DATA_JOB_NAMES } from '../../../../../infrastructure/queue/queue.constants';

describe('TenderExpiryJobHandler', () => {
  let processor: TenderExpiryJobHandler;
  let prisma: any;
  let events: { emit: jest.Mock };
  let circuitBreaker: any;

  beforeEach(async () => {
    prisma = {
      load: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      eDIMessage: {
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };

    events = { emit: jest.fn().mockResolvedValue(undefined) };

    circuitBreaker = {
      isOpen: jest.fn().mockResolvedValue(false),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenderExpiryJobHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
        { provide: VendorCircuitBreakerService, useValue: circuitBreaker },
      ],
    }).compile();

    processor = module.get<TenderExpiryJobHandler>(TenderExpiryJobHandler);
  });

  afterEach(() => jest.clearAllMocks());

  const tenderExpiryJob = (overrides: Partial<{ name: string }> = {}) =>
    ({ name: VENDOR_DATA_JOB_NAMES.EDI_TENDER_EXPIRY, ...overrides }) as any;

  describe('process', () => {
    it('should throw when circuit breaker is open', async () => {
      circuitBreaker.isOpen.mockResolvedValue(true);

      await expect(processor.run(tenderExpiryJob())).rejects.toThrow(/circuit open/i);

      expect(prisma.load.findMany).not.toHaveBeenCalled();
    });

    it('should record success on a clean sweep', async () => {
      prisma.load.findMany.mockResolvedValue([]);

      const result = await processor.run(tenderExpiryJob());

      expect(result).toEqual({ expired: 0 });
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('edi');
    });

    it('should record failure and re-throw on DB failure', async () => {
      prisma.load.findMany.mockRejectedValue(new Error('connection lost'));

      await expect(processor.run(tenderExpiryJob())).rejects.toThrow('connection lost');

      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith('edi');
    });
  });

  describe('checkExpiredTenders (via process)', () => {
    it('should return expired=0 when no expired loads found', async () => {
      prisma.load.findMany.mockResolvedValue([]);

      const result = await processor.run(tenderExpiryJob());

      expect(result).toEqual({ expired: 0 });
      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'TENDER',
            tenderResponse: null,
          }),
        }),
      );
    });

    it('should expire loads with passed deadlines', async () => {
      const expiredLoad = {
        id: 1,
        tenantId: 1,
        ediTenderId: 100,
        tenderExpiresAt: new Date('2026-01-01'),
        ediTenderMessage: {
          tradingPartner: { id: 5, name: 'ABC Freight' },
        },
      };

      prisma.load.findMany.mockResolvedValue([expiredLoad]);
      prisma.load.update.mockResolvedValue({});
      prisma.eDIMessage.update.mockResolvedValue({});

      const result = await processor.run(tenderExpiryJob());

      expect(result).toEqual({ expired: 1 });

      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'CANCELLED',
          tenderResponse: 'EXPIRED',
          cancelledAt: expect.any(Date),
        }),
      });
    });

    it('should update EDI message status to EXPIRED', async () => {
      const expiredLoad = {
        id: 1,
        tenantId: 1,
        ediTenderId: 100,
        tenderExpiresAt: new Date('2026-01-01'),
        ediTenderMessage: { tradingPartner: { id: 5, name: 'ABC' } },
      };

      prisma.load.findMany.mockResolvedValue([expiredLoad]);
      prisma.load.update.mockResolvedValue({});
      prisma.eDIMessage.update.mockResolvedValue({});

      await processor.run(tenderExpiryJob());

      expect(prisma.eDIMessage.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: expect.objectContaining({
          status: 'EXPIRED',
          respondedAt: expect.any(Date),
        }),
      });
    });

    it('should emit EDI_TENDER_EXPIRED event for each expired load', async () => {
      const expiredLoad = {
        id: 1,
        tenantId: 7,
        ediTenderId: 100,
        tenderExpiresAt: new Date('2026-01-01'),
        ediTenderMessage: {
          tradingPartner: { id: 5, name: 'ABC Freight' },
        },
      };

      prisma.load.findMany.mockResolvedValue([expiredLoad]);
      prisma.load.update.mockResolvedValue({});
      prisma.eDIMessage.update.mockResolvedValue({});

      await processor.run(tenderExpiryJob());

      expect(events.emit).toHaveBeenCalledWith(
        expect.stringContaining('tender-expired'),
        7,
        expect.objectContaining({
          loadId: 1,
          partnerId: 5,
          partnerName: 'ABC Freight',
        }),
      );
    });

    it('should skip EDI message update when ediTenderId is null', async () => {
      const expiredLoad = {
        id: 1,
        tenantId: 1,
        ediTenderId: null,
        tenderExpiresAt: new Date('2026-01-01'),
        ediTenderMessage: { tradingPartner: null },
      };

      prisma.load.findMany.mockResolvedValue([expiredLoad]);
      prisma.load.update.mockResolvedValue({});

      await processor.run(tenderExpiryJob());

      expect(prisma.eDIMessage.update).not.toHaveBeenCalled();
    });

    it('should handle transaction errors gracefully', async () => {
      const expiredLoads = [
        {
          id: 1,
          tenantId: 1,
          ediTenderId: 100,
          tenderExpiresAt: new Date('2026-01-01'),
          ediTenderMessage: { tradingPartner: { id: 5, name: 'ABC' } },
        },
        {
          id: 2,
          tenantId: 1,
          ediTenderId: 101,
          tenderExpiresAt: new Date('2026-01-01'),
          ediTenderMessage: { tradingPartner: { id: 6, name: 'XYZ' } },
        },
      ];

      prisma.load.findMany.mockResolvedValue(expiredLoads);
      // First transaction succeeds, second fails
      prisma.$transaction.mockImplementationOnce((fn: any) => fn(prisma)).mockRejectedValueOnce(new Error('DB error'));

      prisma.load.update.mockResolvedValue({});
      prisma.eDIMessage.update.mockResolvedValue({});

      const result = await processor.run(tenderExpiryJob());

      // One succeeded, one failed — total expired = 1
      expect(result).toEqual({ expired: 1 });
    });

    it('should process multiple expired loads', async () => {
      const loads = [
        {
          id: 1,
          tenantId: 1,
          ediTenderId: 100,
          tenderExpiresAt: new Date('2026-01-01'),
          ediTenderMessage: { tradingPartner: { id: 5, name: 'A' } },
        },
        {
          id: 2,
          tenantId: 1,
          ediTenderId: 101,
          tenderExpiresAt: new Date('2026-01-02'),
          ediTenderMessage: { tradingPartner: { id: 6, name: 'B' } },
        },
      ];

      prisma.load.findMany.mockResolvedValue(loads);
      prisma.load.update.mockResolvedValue({});
      prisma.eDIMessage.update.mockResolvedValue({});

      const result = await processor.run(tenderExpiryJob());

      expect(result).toEqual({ expired: 2 });
      expect(events.emit).toHaveBeenCalledTimes(2);
    });
  });
});
