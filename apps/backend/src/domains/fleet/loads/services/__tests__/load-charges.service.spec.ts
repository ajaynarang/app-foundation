import { Test, TestingModule } from '@nestjs/testing';
import { LoadChargesService } from '../load-charges.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('LoadChargesService', () => {
  let service: LoadChargesService;
  let prisma: {
    load: {
      findUniqueOrThrow: jest.Mock;
    };
    loadCharge: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      load: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ billingStatus: 'DRAFT' }),
      },
      loadCharge: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LoadChargesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LoadChargesService>(LoadChargesService);
  });

  describe('addCharge', () => {
    it('should create a charge with computed total', async () => {
      prisma.loadCharge.create.mockResolvedValue({ id: 1, totalCents: 320000 });

      await service.addCharge({
        loadId: 1,
        chargeType: 'linehaul',
        description: 'Linehaul rate',
        unitPriceCents: 320000,
      });

      expect(prisma.loadCharge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          loadId: 1,
          chargeType: 'linehaul',
          quantity: 1,
          unitPriceCents: 320000,
          totalCents: 320000,
        }),
      });
    });

    it('should compute total from quantity * unit price', async () => {
      prisma.loadCharge.create.mockResolvedValue({ id: 2, totalCents: 15000 });

      await service.addCharge({
        loadId: 1,
        chargeType: 'detention_pickup',
        description: 'Detention at pickup',
        quantity: 3,
        unitPriceCents: 5000,
      });

      expect(prisma.loadCharge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quantity: 3,
          unitPriceCents: 5000,
          totalCents: 15000,
        }),
      });
    });
  });

  describe('getCharges', () => {
    it('should return charges for a load in camelCase format', async () => {
      const prismaCharges = [
        {
          id: 1,
          loadId: 10,
          chargeType: 'linehaul',
          description: 'Linehaul rate',
          quantity: 1,
          unitPriceCents: 320000,
          totalCents: 320000,
          isBillable: true,
          isPayable: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      ];
      prisma.loadCharge.findMany.mockResolvedValue(prismaCharges);

      const result = await service.getCharges(10);

      expect(prisma.loadCharge.findMany).toHaveBeenCalledWith({
        where: { loadId: 10 },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 1,
          loadId: 10,
          chargeType: 'linehaul',
          description: 'Linehaul rate',
          quantity: 1,
          unitPriceCents: 320000,
          totalCents: 320000,
          isBillable: true,
          isPayable: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('updateCharge', () => {
    it('should update charge and recompute total', async () => {
      prisma.loadCharge.findUnique.mockResolvedValue({
        id: 1,
        quantity: 1,
        unitPriceCents: 320000,
      });
      prisma.loadCharge.update.mockResolvedValue({ id: 1, totalCents: 640000 });

      await service.updateCharge(1, { quantity: 2 });

      expect(prisma.loadCharge.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          quantity: 2,
          unitPriceCents: 320000,
          totalCents: 640000,
        }),
      });
    });

    it('should throw NotFoundException for missing charge', async () => {
      prisma.loadCharge.findUnique.mockResolvedValue(null);

      await expect(service.updateCharge(999, { quantity: 2 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeCharge', () => {
    it('should delete the charge', async () => {
      prisma.loadCharge.findUnique.mockResolvedValue({ id: 1 });
      prisma.loadCharge.delete.mockResolvedValue({ id: 1 });

      await service.removeCharge(1);

      expect(prisma.loadCharge.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException for missing charge', async () => {
      prisma.loadCharge.findUnique.mockResolvedValue(null);

      await expect(service.removeCharge(999)).rejects.toThrow(NotFoundException);
    });
  });
});
