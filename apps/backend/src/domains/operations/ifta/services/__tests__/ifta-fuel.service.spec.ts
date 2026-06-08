import { Test, TestingModule } from '@nestjs/testing';
import { IftaFuelService } from '../ifta-fuel.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('IftaFuelService', () => {
  let service: IftaFuelService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      iftaFuelPurchase: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn(),
      },
      iftaQuarter: { findUnique: jest.fn(), create: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [IftaFuelService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(IftaFuelService);
  });

  describe('createFuelPurchase', () => {
    it('should create a fuel purchase and auto-assign to correct quarter', async () => {
      prisma.iftaQuarter.findUnique.mockResolvedValue({ id: 1 });
      prisma.iftaFuelPurchase.create.mockResolvedValue({
        id: 10,
        jurisdiction: 'TX',
        gallons: 150,
        pricePerGallon: 3.5,
        totalCostCents: 52500,
        purchaseDate: new Date('2026-02-10'),
        quarterId: 1,
      });
      const result = await service.createFuelPurchase(1, {
        purchaseDate: '2026-02-10',
        jurisdiction: 'TX',
        gallons: 150,
        pricePerGallon: 3.5,
      });
      expect(result.jurisdiction).toBe('TX');
      expect(result.gallons).toBe(150);
      expect(result.quarterId).toBe(1);
    });

    it('should auto-calculate totalCostCents from gallons * price', async () => {
      prisma.iftaQuarter.findUnique.mockResolvedValue({ id: 1 });
      prisma.iftaFuelPurchase.create.mockImplementation(({ data }) => Promise.resolve({ id: 11, ...data }));
      await service.createFuelPurchase(1, {
        purchaseDate: '2026-02-10',
        jurisdiction: 'TX',
        gallons: 100,
        pricePerGallon: 3.5,
      });
      expect(prisma.iftaFuelPurchase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalCostCents: 35000 }),
        }),
      );
    });
  });

  describe('getFuelByState', () => {
    it('should aggregate fuel gallons by state for a quarter', async () => {
      prisma.iftaFuelPurchase.groupBy.mockResolvedValue([
        { jurisdiction: 'TX', _sum: { gallons: 450 }, _count: { id: 3 } },
        { jurisdiction: 'OK', _sum: { gallons: 200 }, _count: { id: 1 } },
      ]);
      const result = await service.getFuelByState(1, 1);
      expect(result).toEqual([
        { jurisdiction: 'TX', totalGallons: 450, purchaseCount: 3 },
        { jurisdiction: 'OK', totalGallons: 200, purchaseCount: 1 },
      ]);
    });
  });

  describe('deleteFuelPurchase', () => {
    it('should delete a fuel purchase by id and tenant', async () => {
      prisma.iftaFuelPurchase.delete.mockResolvedValue({ id: 10 });
      await service.deleteFuelPurchase(1, 10);
      expect(prisma.iftaFuelPurchase.delete).toHaveBeenCalledWith({
        where: { id: 10, tenantId: 1 },
      });
    });
  });
});
