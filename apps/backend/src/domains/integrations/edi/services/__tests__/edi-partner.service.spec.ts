import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EDIPartnerService } from '../edi-partner.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('EDIPartnerService', () => {
  let service: EDIPartnerService;

  const mockPrismaService = {
    eDITradingPartner: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EDIPartnerService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<EDIPartnerService>(EDIPartnerService);
    jest.clearAllMocks();
  });

  describe('listPartners', () => {
    it('should return all partners for a tenant', async () => {
      const partners = [
        {
          id: 1,
          name: 'ABC Freight',
          isaId: 'ABC123',
          tenantId: 1,
          _count: { messages: 5, autoAcceptRules: 2 },
        },
        {
          id: 2,
          name: 'XYZ Logistics',
          isaId: 'XYZ456',
          tenantId: 1,
          _count: { messages: 10, autoAcceptRules: 0 },
        },
      ];
      mockPrismaService.eDITradingPartner.findMany.mockResolvedValue(partners);

      const result = await service.listPartners(1);

      expect(result).toEqual(partners);
      expect(mockPrismaService.eDITradingPartner.findMany).toHaveBeenCalledWith({
        where: { tenantId: 1 },
        include: {
          _count: { select: { messages: true, autoAcceptRules: true } },
        },
        orderBy: { name: 'asc' },
      });
    });

    it('should return empty array when no partners exist', async () => {
      mockPrismaService.eDITradingPartner.findMany.mockResolvedValue([]);

      const result = await service.listPartners(1);

      expect(result).toEqual([]);
    });
  });

  describe('findByIsaId', () => {
    it('should return a partner when found', async () => {
      const partner = {
        id: 1,
        name: 'ABC Freight',
        isaId: 'ABC123',
        tenantId: 1,
      };
      mockPrismaService.eDITradingPartner.findFirst.mockResolvedValue(partner);

      const result = await service.findByIsaId(1, 'ABC123');

      expect(result).toEqual(partner);
      expect(mockPrismaService.eDITradingPartner.findFirst).toHaveBeenCalledWith({
        where: { tenantId: 1, isaId: 'ABC123' },
      });
    });

    it('should return null when partner is not found', async () => {
      mockPrismaService.eDITradingPartner.findFirst.mockResolvedValue(null);

      const result = await service.findByIsaId(1, 'UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('getPartner', () => {
    it('should return partner with active auto-accept rules', async () => {
      const partner = {
        id: 1,
        name: 'ABC Freight',
        tenantId: 1,
        autoAcceptRules: [{ id: 1, name: 'Rule A', isActive: true }],
      };
      mockPrismaService.eDITradingPartner.findFirst.mockResolvedValue(partner);

      const result = await service.getPartner(1, 1);

      expect(result).toEqual(partner);
    });

    it('should throw NotFoundException when partner does not exist', async () => {
      mockPrismaService.eDITradingPartner.findFirst.mockResolvedValue(null);

      await expect(service.getPartner(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createPartner', () => {
    const createDto = {
      name: 'New Broker',
      isaId: 'NEW123',
      gsId: 'GS123',
      vanProvider: 'SPS_COMMERCE',
    };

    it('should create a partner when ISA ID is unique', async () => {
      mockPrismaService.eDITradingPartner.findFirst.mockResolvedValue(null);
      const createdPartner = { id: 3, ...createDto, tenantId: 1 };
      mockPrismaService.eDITradingPartner.create.mockResolvedValue(createdPartner);

      const result = await service.createPartner(1, createDto);

      expect(result).toEqual(createdPartner);
      expect(mockPrismaService.eDITradingPartner.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          name: 'New Broker',
          isaId: 'NEW123',
          gsId: 'GS123',
        }),
      });
    });

    it('should throw ConflictException when ISA ID already exists', async () => {
      const existingPartner = { id: 1, isaId: 'NEW123', tenantId: 1 };
      mockPrismaService.eDITradingPartner.findFirst.mockResolvedValue(existingPartner);

      await expect(service.createPartner(1, createDto)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.eDITradingPartner.create).not.toHaveBeenCalled();
    });
  });

  describe('incrementTenderStats', () => {
    it('should increment tendersReceived', async () => {
      mockPrismaService.eDITradingPartner.update.mockResolvedValue({
        id: 1,
        tendersReceived: 11,
      });

      await service.incrementTenderStats(1, 'tendersReceived');

      expect(mockPrismaService.eDITradingPartner.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          tendersReceived: { increment: 1 },
          lastMessageAt: expect.any(Date),
        },
      });
    });

    it('should increment tendersAccepted', async () => {
      mockPrismaService.eDITradingPartner.update.mockResolvedValue({
        id: 1,
        tendersAccepted: 6,
      });

      await service.incrementTenderStats(1, 'tendersAccepted');

      expect(mockPrismaService.eDITradingPartner.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          tendersAccepted: { increment: 1 },
          lastMessageAt: expect.any(Date),
        },
      });
    });
  });
});
