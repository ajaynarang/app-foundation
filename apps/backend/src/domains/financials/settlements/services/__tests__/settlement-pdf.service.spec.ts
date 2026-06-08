import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SettlementPdfService } from '../settlement-pdf.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

jest.mock(
  'pdfmake/js/Printer',
  () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      createPdfKitDocument: jest.fn().mockReturnValue({
        on: jest.fn().mockImplementation(function (this: any, event: string, cb: (...args: any[]) => any) {
          if (event === 'data') setTimeout(() => cb(Buffer.from('pdf')), 0);
          if (event === 'end') setTimeout(() => cb(), 5);
          return this;
        }),
        end: jest.fn(),
      }),
    })),
  }),
  { virtual: true },
);

describe('SettlementPdfService', () => {
  let service: SettlementPdfService;
  let prisma: any;

  const mockSettlement = {
    settlementId: 'stl-1',
    settlementNumber: 'STL-001',
    periodStart: new Date('2026-01-01'),
    periodEnd: new Date('2026-01-15'),
    status: 'APPROVED',
    grossPayCents: 500000,
    deductionsCents: 50000,
    netPayCents: 450000,
    notes: 'Great work this period',
    approvedAt: new Date(),
    paidAt: null,
    driver: {
      name: 'John Doe',
      payStructures: [{ type: 'PER_MILE', ratePerMileCents: 55, isActive: true }],
    },
    lineItems: [
      {
        loadId: 1,
        miles: 500,
        loadRevenueCents: 250000,
        payAmountCents: 250000,
        load: {
          loadNumber: 'LD-001',
          stops: [{ stop: { city: 'Dallas', state: 'TX' } }, { stop: { city: 'Houston', state: 'TX' } }],
        },
      },
    ],
    deductions: [{ type: 'FUEL_ADVANCE', description: 'Fuel card', amountCents: 50000 }],
  };

  beforeEach(async () => {
    prisma = {
      settlement: { findFirst: jest.fn().mockResolvedValue(mockSettlement) },
      invoiceSettings: {
        findUnique: jest.fn().mockResolvedValue({ companyLegalName: 'Test LLC' }),
      },
    };

    const module = await Test.createTestingModule({
      providers: [SettlementPdfService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SettlementPdfService);
  });

  it('should throw NotFoundException when not found', async () => {
    prisma.settlement.findFirst.mockResolvedValue(null);
    await expect(service.generatePdf(1, 'stl-x')).rejects.toThrow(NotFoundException);
  });

  it('should generate PDF buffer', async () => {
    const buffer = await service.generatePdf(1, 'stl-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle PERCENTAGE pay type', async () => {
    prisma.settlement.findFirst.mockResolvedValue({
      ...mockSettlement,
      driver: {
        name: 'Jane',
        payStructures: [{ type: 'PERCENTAGE', percentage: 25, isActive: true }],
      },
    });
    const buffer = await service.generatePdf(1, 'stl-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle FLAT_RATE pay type', async () => {
    prisma.settlement.findFirst.mockResolvedValue({
      ...mockSettlement,
      driver: {
        name: 'Bob',
        payStructures: [{ type: 'FLAT_RATE', flatRateCents: 100000, isActive: true }],
      },
    });
    const buffer = await service.generatePdf(1, 'stl-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle HYBRID pay type', async () => {
    prisma.settlement.findFirst.mockResolvedValue({
      ...mockSettlement,
      driver: {
        name: 'Sam',
        payStructures: [
          {
            type: 'HYBRID',
            hybridBaseCents: 50000,
            hybridPercent: 10,
            isActive: true,
          },
        ],
      },
    });
    const buffer = await service.generatePdf(1, 'stl-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle settlement with no deductions', async () => {
    prisma.settlement.findFirst.mockResolvedValue({
      ...mockSettlement,
      deductions: [],
      deductionsCents: 0,
    });
    const buffer = await service.generatePdf(1, 'stl-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should handle settlement without notes', async () => {
    prisma.settlement.findFirst.mockResolvedValue({
      ...mockSettlement,
      notes: null,
    });
    const buffer = await service.generatePdf(1, 'stl-1');
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
