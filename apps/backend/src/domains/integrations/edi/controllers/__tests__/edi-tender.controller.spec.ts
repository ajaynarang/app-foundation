import { Test, TestingModule } from '@nestjs/testing';
import { EDITenderController } from '../edi-tender.controller';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { TenderService } from '../../tender/tender.service';
import { TenderRulesService } from '../../tender/tender-rules.service';
import { EDIMessageService } from '../../services/edi-message.service';

const TENANT = { id: 5, tenantId: 'tenant-abc' };

const mockPrisma = {
  tenant: {
    findUnique: jest.fn().mockResolvedValue(TENANT),
  },
};

describe('EDITenderController', () => {
  let controller: EDITenderController;
  let tenderService: any;
  let rulesService: any;
  let messageService: any;

  const mockUser = { tenantId: 'tenant-abc', id: 42 };

  beforeEach(async () => {
    tenderService = {
      respondToTender: jest.fn(),
    };
    rulesService = {
      listRules: jest.fn(),
      createRule: jest.fn(),
      approveRule: jest.fn(),
    };
    messageService = {
      findPendingTenders: jest.fn(),
    };

    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EDITenderController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenderService, useValue: tenderService },
        { provide: TenderRulesService, useValue: rulesService },
        { provide: EDIMessageService, useValue: messageService },
      ],
    }).compile();

    controller = module.get<EDITenderController>(EDITenderController);
  });

  describe('listPendingTenders', () => {
    it('should resolve tenant and call findPendingTenders', async () => {
      const tenders = [{ id: 1, status: 'PENDING' }];
      messageService.findPendingTenders.mockResolvedValue(tenders);

      const result = await controller.listPendingTenders(mockUser);

      expect(result).toEqual(tenders);
      expect(messageService.findPendingTenders).toHaveBeenCalledWith(5);
    });
  });

  describe('respondToTender', () => {
    it('should call tenderService.respondToTender with accept', async () => {
      const response = { success: true };
      tenderService.respondToTender.mockResolvedValue(response);

      const result = await controller.respondToTender(mockUser, 10, {
        response: 'accept',
      });

      expect(result).toEqual(response);
      expect(tenderService.respondToTender).toHaveBeenCalledWith(5, 10, 'accept', undefined);
    });

    it('should pass counterRateCents for counter response', async () => {
      tenderService.respondToTender.mockResolvedValue({ success: true });

      await controller.respondToTender(mockUser, 10, {
        response: 'counter',
        counterRateCents: 300000,
      });

      expect(tenderService.respondToTender).toHaveBeenCalledWith(5, 10, 'counter', 300000);
    });

    it('should call tenderService.respondToTender with decline', async () => {
      tenderService.respondToTender.mockResolvedValue({ success: true });

      await controller.respondToTender(mockUser, 10, {
        response: 'decline',
      });

      expect(tenderService.respondToTender).toHaveBeenCalledWith(5, 10, 'decline', undefined);
    });
  });

  describe('listRules', () => {
    it('should return auto-accept rules for tenant', async () => {
      const rules = [{ id: 1, name: 'Rule A' }];
      rulesService.listRules.mockResolvedValue(rules);

      const result = await controller.listRules(mockUser);

      expect(result).toEqual(rules);
      expect(rulesService.listRules).toHaveBeenCalledWith(5);
    });
  });

  describe('createRule', () => {
    it('should create a new auto-accept rule', async () => {
      const body = {
        name: 'TX to GA',
        conditions: { minRatePerMile: 2.5 },
        tradingPartnerId: 1,
        priority: 10,
      };
      const created = { id: 1, ...body, tenantId: 5 };
      rulesService.createRule.mockResolvedValue(created);

      const result = await controller.createRule(mockUser, body);

      expect(result).toEqual(created);
      expect(rulesService.createRule).toHaveBeenCalledWith(5, body);
    });
  });

  describe('approveRule', () => {
    it('should approve a sally-suggested rule', async () => {
      const approved = { id: 7, approvedAt: new Date() };
      rulesService.approveRule.mockResolvedValue(approved);

      const result = await controller.approveRule(mockUser, 7);

      expect(result).toEqual(approved);
      expect(rulesService.approveRule).toHaveBeenCalledWith(5, 7, 42);
    });
  });
});
