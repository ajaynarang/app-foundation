import { Test, TestingModule } from '@nestjs/testing';
import { EDISettingsController } from '../edi-settings.controller';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EDIPartnerService } from '../../services/edi-partner.service';
import { EDIMessageService } from '../../services/edi-message.service';

const TENANT = { id: 5, tenantId: 'tenant-abc' };

const mockPrisma = {
  tenant: {
    findUnique: jest.fn().mockResolvedValue(TENANT),
  },
};

describe('EDISettingsController', () => {
  let controller: EDISettingsController;
  let partnerService: any;
  let messageService: any;

  const mockUser = { tenantId: 'tenant-abc' };

  beforeEach(async () => {
    partnerService = {
      listPartners: jest.fn(),
      getPartner: jest.fn(),
      createPartner: jest.fn(),
      updatePartner: jest.fn(),
    };
    messageService = {
      listMessages: jest.fn(),
    };

    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue(TENANT);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EDISettingsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EDIPartnerService, useValue: partnerService },
        { provide: EDIMessageService, useValue: messageService },
      ],
    }).compile();

    controller = module.get<EDISettingsController>(EDISettingsController);
  });

  describe('listPartners', () => {
    it('should resolve tenant and list partners', async () => {
      const partners = [
        { id: 1, name: 'ABC', isaId: 'ABC123' },
        { id: 2, name: 'XYZ', isaId: 'XYZ456' },
      ];
      partnerService.listPartners.mockResolvedValue(partners);

      const result = await controller.listPartners(mockUser);

      expect(result).toEqual(partners);
      expect(partnerService.listPartners).toHaveBeenCalledWith(5);
    });
  });

  describe('getPartner', () => {
    it('should resolve tenant and get partner details', async () => {
      const partner = { id: 1, name: 'ABC', isaId: 'ABC123', tenantId: 5 };
      partnerService.getPartner.mockResolvedValue(partner);

      const result = await controller.getPartner(mockUser, 1);

      expect(result).toEqual(partner);
      expect(partnerService.getPartner).toHaveBeenCalledWith(5, 1);
    });
  });

  describe('createPartner', () => {
    it('should resolve tenant and create partner', async () => {
      const body = {
        name: 'New Broker',
        isaId: 'NEW123',
        gsId: 'GS123',
        vanProvider: 'SPS_COMMERCE',
      };
      const created = { id: 3, ...body, tenantId: 5 };
      partnerService.createPartner.mockResolvedValue(created);

      const result = await controller.createPartner(mockUser, body);

      expect(result).toEqual(created);
      expect(partnerService.createPartner).toHaveBeenCalledWith(5, body);
    });
  });

  describe('updatePartner', () => {
    it('should resolve tenant and update partner', async () => {
      const body = { name: 'Updated Broker' };
      const updated = { id: 1, name: 'Updated Broker', tenantId: 5 };
      partnerService.updatePartner.mockResolvedValue(updated);

      const result = await controller.updatePartner(mockUser, 1, body);

      expect(result).toEqual(updated);
      expect(partnerService.updatePartner).toHaveBeenCalledWith(5, 1, body);
    });
  });

  describe('listMessages', () => {
    it('should resolve tenant and list messages with params', async () => {
      const messages = { data: [{ id: 1 }], total: 1 };
      messageService.listMessages.mockResolvedValue(messages);

      const params = {
        direction: 'INBOUND',
        messageType: 'T204',
        status: 'RECEIVED',
        page: 1,
        limit: 20,
      };

      const result = await controller.listMessages(mockUser, params as any);

      expect(result).toEqual(messages);
      expect(messageService.listMessages).toHaveBeenCalledWith(5, params);
    });

    it('should work with empty params', async () => {
      messageService.listMessages.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.listMessages(mockUser, {} as any);

      expect(result).toEqual({ data: [], total: 0 });
      expect(messageService.listMessages).toHaveBeenCalledWith(5, {});
    });
  });
});
