import { Test, TestingModule } from '@nestjs/testing';
import { TenderRulesService, TenderForEvaluation } from '../tender-rules.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('TenderRulesService', () => {
  let service: TenderRulesService;

  const mockPrismaService = {
    eDIAutoAcceptRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenderRulesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TenderRulesService>(TenderRulesService);
    jest.clearAllMocks();
  });

  describe('evaluateRules', () => {
    const baseTender: TenderForEvaluation = {
      rateCents: 300000, // $3000
      totalMiles: 1000, // $3.00/mi
      equipmentType: 'dry_van',
      tradingPartnerId: 1,
      originState: 'TX',
      destinationState: 'GA',
      hazmat: false,
    };

    it('should return a matching rule', async () => {
      const rule = {
        id: 1,
        name: 'TX to GA rule',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: {
          minRatePerMile: 2.5,
          lanes: [{ originState: 'TX', destinationState: 'GA' }],
        },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      const result = await service.evaluateRules(1, baseTender);

      expect(result).toEqual(rule);
    });

    it('should return null when no rules match', async () => {
      const rule = {
        id: 1,
        name: 'High rate rule',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: {
          minRatePerMile: 5.0, // $3/mi < $5/mi threshold
        },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      const result = await service.evaluateRules(1, baseTender);

      expect(result).toBeNull();
    });

    it('should skip unapproved sally-suggested rules', async () => {
      const sallyRule = {
        id: 1,
        name: 'Sally suggestion',
        isActive: true,
        createdBy: 'sally_suggested',
        approvedAt: null, // Not approved
        conditions: {
          minRatePerMile: 1.0, // Would match
        },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([sallyRule]);

      const result = await service.evaluateRules(1, baseTender);

      expect(result).toBeNull();
    });

    it('should allow approved sally-suggested rules', async () => {
      const sallyRule = {
        id: 1,
        name: 'Sally suggestion (approved)',
        isActive: true,
        createdBy: 'sally_suggested',
        approvedAt: new Date(), // Approved
        conditions: {
          minRatePerMile: 2.0,
        },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([sallyRule]);

      await service.evaluateRules(1, sallyRule as any);

      // Need a proper tender
      const result2 = await service.evaluateRules(1, baseTender);
      expect(result2).toEqual(sallyRule);
    });

    it('should reject tenders below minRatePerMile', async () => {
      const rule = {
        id: 1,
        name: 'Min rate rule',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: { minRatePerMile: 4.0 },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      // $3000/1000mi = $3.00/mi, below $4.00 threshold
      const result = await service.evaluateRules(1, baseTender);

      expect(result).toBeNull();
    });

    it('should reject tenders exceeding maxDistance', async () => {
      const rule = {
        id: 1,
        name: 'Max distance rule',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: { maxDistance: 500 },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      // 1000 miles > 500 max
      const result = await service.evaluateRules(1, baseTender);

      expect(result).toBeNull();
    });

    it('should reject hazmat when excludeHazmat is true', async () => {
      const rule = {
        id: 1,
        name: 'No hazmat rule',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: { excludeHazmat: true },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      const hazmatTender = { ...baseTender, hazmat: true };
      const result = await service.evaluateRules(1, hazmatTender);

      expect(result).toBeNull();
    });

    it('should reject tenders with non-matching equipment type', async () => {
      const rule = {
        id: 1,
        name: 'Reefer only rule',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: { equipmentTypes: ['reefer'] },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      // baseTender has dry_van, rule wants reefer
      const result = await service.evaluateRules(1, baseTender);

      expect(result).toBeNull();
    });

    it('should reject tenders with non-matching lanes', async () => {
      const rule = {
        id: 1,
        name: 'CA to WA only',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: { lanes: [{ originState: 'CA', destinationState: 'WA' }] },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      // baseTender is TX to GA
      const result = await service.evaluateRules(1, baseTender);

      expect(result).toBeNull();
    });

    it('should handle zero miles gracefully (rate per mile = 0)', async () => {
      const rule = {
        id: 1,
        name: 'Min rate rule',
        isActive: true,
        createdBy: 'user',
        approvedAt: new Date(),
        conditions: { minRatePerMile: 2.0 },
        priority: 10,
      };
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue([rule]);

      const zeroMileTender = { ...baseTender, totalMiles: 0 };
      const result = await service.evaluateRules(1, zeroMileTender);

      expect(result).toBeNull();
    });
  });

  describe('listRules', () => {
    it('should return all rules for a tenant', async () => {
      const rules = [
        { id: 1, name: 'Rule A', isActive: true },
        { id: 2, name: 'Rule B', isActive: false },
      ];
      mockPrismaService.eDIAutoAcceptRule.findMany.mockResolvedValue(rules);

      const result = await service.listRules(1);

      expect(result).toEqual(rules);
      expect(mockPrismaService.eDIAutoAcceptRule.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1 },
        include: { tradingPartner: { select: { name: true } } },
        orderBy: [{ isActive: 'desc' }, { priority: 'desc' }],
      });
    });
  });

  describe('createRule', () => {
    it('should create a user rule with approvedAt set', async () => {
      const ruleData = {
        name: 'New Rule',
        conditions: { minRatePerMile: 3.0 },
        createdBy: 'user',
      };
      mockPrismaService.eDIAutoAcceptRule.create.mockResolvedValue({
        id: 1,
        ...ruleData,
        tenantId: 1,
        isActive: true,
      });

      const result = await service.createRule(1, ruleData);

      expect(result).toBeDefined();
      expect(mockPrismaService.eDIAutoAcceptRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          name: 'New Rule',
          createdBy: 'user',
          approvedAt: expect.any(Date),
        }),
      });
    });

    it('should create a sally_suggested rule with null approvedAt', async () => {
      const ruleData = {
        name: 'Sally Suggestion',
        conditions: { minRatePerMile: 2.5 },
        createdBy: 'sally_suggested',
      };
      mockPrismaService.eDIAutoAcceptRule.create.mockResolvedValue({
        id: 2,
        ...ruleData,
        tenantId: 1,
        approvedAt: null,
      });

      await service.createRule(1, ruleData);

      expect(mockPrismaService.eDIAutoAcceptRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdBy: 'sally_suggested',
          approvedAt: null,
        }),
      });
    });
  });

  describe('incrementMatchCount', () => {
    it('should increment the match count and set lastMatchAt', async () => {
      mockPrismaService.eDIAutoAcceptRule.update.mockResolvedValue({
        id: 1,
        matchCount: 5,
      });

      await service.incrementMatchCount(1);

      expect(mockPrismaService.eDIAutoAcceptRule.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { matchCount: { increment: 1 }, lastMatchAt: expect.any(Date) },
      });
    });
  });

  describe('approveRule', () => {
    beforeEach(() => {
      mockPrismaService.eDIAutoAcceptRule.findFirst = jest.fn();
    });

    it('should approve a rule and set approvedByUserId', async () => {
      mockPrismaService.eDIAutoAcceptRule.findFirst.mockResolvedValue({
        id: 5,
        tenantId: 1,
        name: 'Sally suggestion',
      });
      mockPrismaService.eDIAutoAcceptRule.update.mockResolvedValue({
        id: 5,
        approvedAt: new Date(),
        approvedByUserId: 42,
      });

      const result = await service.approveRule(1, 5, 42);

      expect(result.approvedByUserId).toBe(42);
      expect(mockPrismaService.eDIAutoAcceptRule.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: {
          approvedAt: expect.any(Date),
          approvedByUserId: 42,
        },
      });
    });

    it('should throw NotFoundException when rule not found', async () => {
      mockPrismaService.eDIAutoAcceptRule.findFirst.mockResolvedValue(null);

      await expect(service.approveRule(1, 999, 42)).rejects.toThrow('not found');
    });
  });

  describe('updateRule', () => {
    beforeEach(() => {
      mockPrismaService.eDIAutoAcceptRule.findFirst = jest.fn();
    });

    it('should update rule name and priority', async () => {
      mockPrismaService.eDIAutoAcceptRule.findFirst.mockResolvedValue({
        id: 3,
        tenantId: 1,
      });
      mockPrismaService.eDIAutoAcceptRule.update.mockResolvedValue({
        id: 3,
        name: 'Updated Rule',
        priority: 20,
      });

      const result = await service.updateRule(1, 3, {
        name: 'Updated Rule',
        priority: 20,
      });

      expect(result.name).toBe('Updated Rule');
      expect(mockPrismaService.eDIAutoAcceptRule.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: expect.objectContaining({
          name: 'Updated Rule',
          priority: 20,
        }),
      });
    });

    it('should update isActive flag', async () => {
      mockPrismaService.eDIAutoAcceptRule.findFirst.mockResolvedValue({
        id: 3,
        tenantId: 1,
      });
      mockPrismaService.eDIAutoAcceptRule.update.mockResolvedValue({
        id: 3,
        isActive: false,
      });

      const result = await service.updateRule(1, 3, { isActive: false });

      expect(result.isActive).toBe(false);
    });

    it('should update conditions', async () => {
      mockPrismaService.eDIAutoAcceptRule.findFirst.mockResolvedValue({
        id: 3,
        tenantId: 1,
      });
      mockPrismaService.eDIAutoAcceptRule.update.mockResolvedValue({
        id: 3,
        conditions: { minRatePerMile: 4.0 },
      });

      await service.updateRule(1, 3, {
        conditions: { minRatePerMile: 4.0 },
      });

      expect(mockPrismaService.eDIAutoAcceptRule.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: expect.objectContaining({
          conditions: { minRatePerMile: 4.0 },
        }),
      });
    });

    it('should throw NotFoundException when rule not found', async () => {
      mockPrismaService.eDIAutoAcceptRule.findFirst.mockResolvedValue(null);

      await expect(service.updateRule(1, 999, { name: 'test' })).rejects.toThrow('not found');
    });
  });
});
