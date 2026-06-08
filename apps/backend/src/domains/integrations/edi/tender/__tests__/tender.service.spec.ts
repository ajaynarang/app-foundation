import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenderService } from '../tender.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../../infrastructure/database/counter.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { EDIMessageService } from '../../services/edi-message.service';
import { EDIPartnerService } from '../../services/edi-partner.service';
import { TenderRulesService } from '../tender-rules.service';
import { EDI_ADAPTER } from '../../adapters/edi-adapter.interface';
import { PlansService } from '../../../../platform/plans/plans.service';
import { AddOnsService } from '../../../../platform/add-ons/add-ons.service';
import { createMockPrisma, createMockDomainEventService } from '../../../../../test/mocks';

describe('TenderService', () => {
  let service: TenderService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let eventEmitter: ReturnType<typeof createMockDomainEventService>;

  const mockCounterService = {
    nextValue: jest.fn().mockResolvedValue(1),
  };

  const mockMessageService = {
    logMessage: jest.fn(),
    markResponded: jest.fn(),
  };

  const mockPartnerService = {
    findByIsaId: jest.fn(),
    incrementTenderStats: jest.fn(),
  };

  const mockRulesService = {
    evaluateRules: jest.fn(),
    incrementMatchCount: jest.fn(),
  };

  const mockAdapter = {
    parseTender: jest.fn(),
    sendTenderResponse: jest.fn(),
  };

  const mockPlansService = {
    isFeatureEnabled: jest.fn(),
  };

  const mockAddOnsService = {
    incrementUsage: jest.fn().mockResolvedValue({
      allowed: true,
      currentUsage: 1,
      usageLimit: 100,
      overageUsage: 0,
    }),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    // Prisma generates eDIMessage/eDITradingPartner (capital DI) for EDI models
    if (!prisma.eDIMessage) prisma.eDIMessage = prisma.ediMessage;
    if (!prisma.eDITradingPartner) prisma.eDITradingPartner = prisma.ediTradingPartner;
    if (!prisma.eDIAutoAcceptRule) prisma.eDIAutoAcceptRule = prisma.ediAutoAcceptRule;
    eventEmitter = createMockDomainEventService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenderService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterService, useValue: mockCounterService },
        { provide: EDIMessageService, useValue: mockMessageService },
        { provide: EDIPartnerService, useValue: mockPartnerService },
        { provide: TenderRulesService, useValue: mockRulesService },
        { provide: EDI_ADAPTER, useValue: mockAdapter },
        { provide: DomainEventService, useValue: eventEmitter },
        { provide: PlansService, useValue: mockPlansService },
        { provide: AddOnsService, useValue: mockAddOnsService },
      ],
    }).compile();

    service = module.get<TenderService>(TenderService);
  });

  afterEach(() => jest.clearAllMocks());

  const mockParsedTender = {
    transactionSetId: 'TS-001',
    brokerReference: 'BR-001',
    brokerName: 'Test Broker',
    shipmentId: 'SHP-001',
    rateCents: 250000,
    weightLbs: 40000,
    commodityType: 'General Freight',
    equipmentType: 'DRY_VAN',
    specialRequirements: null,
    responseDeadline: null,
    stops: [
      {
        sequence: 1,
        actionType: 'pickup',
        address: '123 Main St',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
      },
      {
        sequence: 2,
        actionType: 'delivery',
        address: '456 Elm St',
        city: 'Atlanta',
        state: 'GA',
        zip: '30301',
      },
    ],
  };

  const mockPartner = {
    id: 1,
    name: 'Test Partner',
    vanConfig: { connectionId: 'conn_1' },
  };

  // ─── processInboundTender ────────────────────────────────────────────────

  describe('processInboundTender', () => {
    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({
        tenantId: 'tnt_1',
        plan: 'PROFESSIONAL',
      });
      mockPlansService.isFeatureEnabled.mockResolvedValue(true);
      mockAddOnsService.incrementUsage.mockResolvedValue({
        allowed: true,
        currentUsage: 1,
        usageLimit: 100,
        overageUsage: 0,
      });
      mockPartnerService.findByIsaId.mockResolvedValue(mockPartner);
      mockAdapter.parseTender.mockResolvedValue(mockParsedTender);
      // Customer lookup for broker name
      prisma.customer.findFirst.mockResolvedValue({ id: 10 });
      // Idempotency check — no duplicate
      prisma.eDIMessage.findFirst.mockResolvedValue(null);
      mockRulesService.evaluateRules.mockResolvedValue(null); // no auto-accept
      // Transaction mocks (tx is the same prisma mock via $transaction callback)
      prisma.eDIMessage.create.mockResolvedValue({ id: 100 });
      prisma.eDITradingPartner.update.mockResolvedValue({});
      prisma.load.create.mockResolvedValue({
        id: 1,
        loadNumber: 'LD-20260402-001',
        status: 'TENDER',
        stops: [],
      });
      prisma.eDIMessage.update.mockResolvedValue({});
    });

    it('should throw NotFoundException when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.processInboundTender(999, 'ISA-001', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when EDI not enabled for plan', async () => {
      mockPlansService.isFeatureEnabled.mockResolvedValue(false);

      await expect(service.processInboundTender(1, 'ISA-001', {})).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for unknown trading partner', async () => {
      mockPartnerService.findByIsaId.mockResolvedValue(null);

      await expect(service.processInboundTender(1, 'ISA-UNKNOWN', {})).rejects.toThrow(NotFoundException);
    });

    it('should create load from tender in tender status', async () => {
      const result = await service.processInboundTender(1, 'ISA-001', {});

      expect(result.load).toBeDefined();
      expect(result.autoAccepted).toBe(false);
      expect(prisma.load.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant: { connect: { id: 1 } },
            status: 'TENDER',
            customerName: 'Test Broker',
            intakeSource: 'edi',
          }),
        }),
      );
    });

    it('should emit EDI_TENDER_RECEIVED event', async () => {
      await service.processInboundTender(1, 'ISA-001', {});

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining('tender-received'),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should log EDI message via transaction', async () => {
      await service.processInboundTender(1, 'ISA-001', {});

      expect(prisma.eDIMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 1,
            tradingPartnerId: 1,
            direction: 'INBOUND',
            messageType: 'T204',
          }),
        }),
      );
    });

    it('should increment partner tender stats in transaction', async () => {
      await service.processInboundTender(1, 'ISA-001', {});

      expect(prisma.eDITradingPartner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            tendersReceived: { increment: 1 },
          }),
        }),
      );
    });

    // ─── Auto-accept ─────────────────────────────────────────────────────

    describe('auto-accept', () => {
      it('should auto-accept when matching rule found', async () => {
        const rule = { id: 5, name: 'High-value Dallas loads' };
        mockRulesService.evaluateRules.mockResolvedValue(rule);
        mockAdapter.sendTenderResponse.mockResolvedValue({ success: true });
        prisma.load.create.mockResolvedValue({
          id: 1,
          loadNumber: 'LOAD-AUTO',
          status: 'PENDING',
          stops: [],
        });

        const result = await service.processInboundTender(1, 'ISA-001', {});

        expect(result.autoAccepted).toBe(true);
        expect(mockAdapter.sendTenderResponse).toHaveBeenCalledWith(mockPartner.vanConfig, 'BR-001', 'accept');
        expect(mockRulesService.incrementMatchCount).toHaveBeenCalledWith(5);
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          expect.stringContaining('tender-accepted'),
          expect.any(Number),
          expect.any(Object),
        );
      });

      it('should set load status to pending when auto-accepted', async () => {
        mockRulesService.evaluateRules.mockResolvedValue({
          id: 5,
          name: 'Rule',
        });
        mockAdapter.sendTenderResponse.mockResolvedValue({ success: true });
        prisma.load.create.mockResolvedValue({
          id: 1,
          status: 'PENDING',
          stops: [],
        });

        await service.processInboundTender(1, 'ISA-001', {});

        expect(prisma.load.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'PENDING',
            }),
          }),
        );
      });
    });
  });

  // ─── respondToTender ─────────────────────────────────────────────────────

  describe('respondToTender', () => {
    const mockTenderLoad = {
      id: 1,
      tenantId: 1,
      status: 'TENDER',
      ediTenderId: 100,
      intakeMetadata: { brokerReference: 'BR-001' },
      ediTenderMessage: {
        tradingPartner: mockPartner,
      },
    };

    beforeEach(() => {
      prisma.load.findFirst.mockResolvedValue(mockTenderLoad);
      prisma.load.update.mockResolvedValue({
        ...mockTenderLoad,
        status: 'PENDING',
      });
      prisma.eDIMessage.update.mockResolvedValue({});
      prisma.eDITradingPartner.update.mockResolvedValue({});
      mockAdapter.sendTenderResponse.mockResolvedValue({ success: true });
    });

    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.respondToTender(1, 999, 'accept')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when no EDI tender', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...mockTenderLoad,
        ediTenderMessage: null,
      });

      await expect(service.respondToTender(1, 1, 'accept')).rejects.toThrow(BadRequestException);
    });

    it('should accept tender and set load to pending', async () => {
      await service.respondToTender(1, 1, 'accept');

      expect(mockAdapter.sendTenderResponse).toHaveBeenCalledWith(mockPartner.vanConfig, 'BR-001', 'accept', undefined);
      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'PENDING',
          tenderResponse: 'ACCEPTED',
        }),
      });
    });

    it('should decline tender and set load to cancelled', async () => {
      prisma.load.update.mockResolvedValue({
        ...mockTenderLoad,
        status: 'CANCELLED',
      });

      await service.respondToTender(1, 1, 'decline');

      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'CANCELLED',
          tenderResponse: 'DECLINED',
          cancelledAt: expect.any(Date),
        }),
      });
    });

    it('should throw BadRequestException when adapter fails', async () => {
      mockAdapter.sendTenderResponse.mockResolvedValue({
        success: false,
        errorMessage: 'Network error',
      });

      await expect(service.respondToTender(1, 1, 'accept')).rejects.toThrow(BadRequestException);
    });

    it('should emit correct event for response type', async () => {
      await service.respondToTender(1, 1, 'accept');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.stringContaining('tender-accepted'),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it('should increment partner stats for accept in transaction', async () => {
      await service.respondToTender(1, 1, 'accept');

      expect(prisma.eDITradingPartner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            tendersAccepted: { increment: 1 },
          }),
        }),
      );
    });

    it('should increment partner stats for decline in transaction', async () => {
      prisma.load.update.mockResolvedValue({
        ...mockTenderLoad,
        status: 'CANCELLED',
      });

      await service.respondToTender(1, 1, 'decline');

      expect(prisma.eDITradingPartner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            tendersDeclined: { increment: 1 },
          }),
        }),
      );
    });

    it('should pass counter rate for counter response', async () => {
      prisma.load.update.mockResolvedValue({
        ...mockTenderLoad,
        status: 'TENDER',
      });

      await service.respondToTender(1, 1, 'counter', 300000);

      expect(mockAdapter.sendTenderResponse).toHaveBeenCalledWith(
        mockPartner.vanConfig,
        'BR-001',
        'counter',
        3000, // 300000 cents / 100
      );
    });
  });
});
