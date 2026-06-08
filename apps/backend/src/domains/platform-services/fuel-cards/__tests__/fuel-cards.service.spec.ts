import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FuelCardsService } from '../fuel-cards.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  fuelCardType: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  brandFuelCardAcceptance: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn((cb: any) => cb(mockPrisma)),
};

describe('FuelCardsService', () => {
  let service: FuelCardsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [FuelCardsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<FuelCardsService>(FuelCardsService);
  });

  describe('getAllCardTypes', () => {
    it('should return all card types', async () => {
      mockPrisma.fuelCardType.findMany.mockResolvedValue([{ id: 'comdata', displayName: 'Comdata' }]);
      const result = await service.getAllCardTypes();
      expect(result).toHaveLength(1);
    });
  });

  describe('updateCardType', () => {
    it('should throw if card type not found', async () => {
      mockPrisma.fuelCardType.findUnique.mockResolvedValue(null);
      await expect(service.updateCardType('invalid', { displayName: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('should update card type', async () => {
      mockPrisma.fuelCardType.findUnique.mockResolvedValue({ id: 'comdata' });
      mockPrisma.fuelCardType.update.mockResolvedValue({
        id: 'comdata',
        isActive: false,
      });
      const result = await service.updateCardType('comdata', {
        isActive: false,
      });
      expect(result.isActive).toBe(false);
    });
  });

  describe('setBrandAcceptance', () => {
    it('should throw for invalid fuel card type IDs', async () => {
      mockPrisma.fuelCardType.findMany.mockResolvedValue([{ id: 'comdata' }]);
      await expect(service.setBrandAcceptance('Shell', ['comdata', 'invalid'])).rejects.toThrow(BadRequestException);
    });

    it('should replace brand card mappings', async () => {
      mockPrisma.fuelCardType.findMany.mockResolvedValue([{ id: 'comdata' }, { id: 'wex' }]);
      mockPrisma.brandFuelCardAcceptance.deleteMany.mockResolvedValue({});
      mockPrisma.brandFuelCardAcceptance.createMany.mockResolvedValue({});
      mockPrisma.brandFuelCardAcceptance.findMany.mockResolvedValue([
        {
          brand: 'Shell',
          fuelCardTypeId: 'comdata',
          fuelCardType: { displayName: 'Comdata' },
        },
      ]);

      const result = await service.setBrandAcceptance('Shell', ['comdata', 'wex']);
      expect(result.brand).toBe('Shell');
    });
  });

  describe('deleteBrand', () => {
    it('should throw if brand not found', async () => {
      mockPrisma.brandFuelCardAcceptance.count.mockResolvedValue(0);
      await expect(service.deleteBrand('Unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBrandsAcceptingCards', () => {
    it('should return empty for empty input', async () => {
      const result = await service.getBrandsAcceptingCards([]);
      expect(result).toEqual([]);
    });

    it('should return distinct brands', async () => {
      mockPrisma.brandFuelCardAcceptance.findMany.mockResolvedValue([{ brand: 'Shell' }, { brand: 'Pilot' }]);
      const result = await service.getBrandsAcceptingCards(['comdata']);
      expect(result).toEqual(['Shell', 'Pilot']);
    });
  });

  describe('getActiveCardTypes', () => {
    it('should return only active card types', async () => {
      mockPrisma.fuelCardType.findMany.mockResolvedValue([{ id: 'comdata', displayName: 'Comdata', isActive: true }]);
      const result = await service.getActiveCardTypes();
      expect(result).toHaveLength(1);
      expect(mockPrisma.fuelCardType.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { displayName: 'asc' },
      });
    });
  });

  describe('getBrandAcceptanceMap', () => {
    it('should group brands with their accepted cards', async () => {
      mockPrisma.brandFuelCardAcceptance.findMany.mockResolvedValue([
        {
          brand: 'Pilot',
          fuelCardTypeId: 'comdata',
          fuelCardType: { displayName: 'Comdata' },
        },
        {
          brand: 'Pilot',
          fuelCardTypeId: 'wex',
          fuelCardType: { displayName: 'WEX' },
        },
        {
          brand: 'Shell',
          fuelCardTypeId: 'comdata',
          fuelCardType: { displayName: 'Comdata' },
        },
      ]);

      const result = await service.getBrandAcceptanceMap();

      expect(result).toHaveLength(2);
      const pilot = result.find((r: any) => r.brand === 'Pilot');
      expect(pilot.cards).toHaveLength(2);
      const shell = result.find((r: any) => r.brand === 'Shell');
      expect(shell.cards).toHaveLength(1);
    });
  });

  describe('deleteBrand', () => {
    it('should delete brand when it exists', async () => {
      mockPrisma.brandFuelCardAcceptance.count.mockResolvedValue(3);
      mockPrisma.brandFuelCardAcceptance.deleteMany.mockResolvedValue({
        count: 3,
      });

      await service.deleteBrand('Shell');

      expect(mockPrisma.brandFuelCardAcceptance.deleteMany).toHaveBeenCalledWith({ where: { brand: 'Shell' } });
    });
  });

  describe('setBrandAcceptance with empty IDs', () => {
    it('should handle empty fuelCardTypeIds gracefully', async () => {
      mockPrisma.fuelCardType.findMany.mockResolvedValue([]);
      mockPrisma.brandFuelCardAcceptance.deleteMany.mockResolvedValue({});
      // Should not call createMany when no IDs
      mockPrisma.brandFuelCardAcceptance.findMany.mockResolvedValue([]);

      const result = await service.setBrandAcceptance('Shell', []);

      expect(result.brand).toBe('Shell');
      expect(result.cards).toEqual([]);
    });
  });
});
