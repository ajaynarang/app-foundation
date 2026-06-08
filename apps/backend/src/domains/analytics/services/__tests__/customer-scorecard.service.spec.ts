import { Test, TestingModule } from '@nestjs/testing';
import { CustomerScorecardService } from '../customer-scorecard.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  customer: { findMany: jest.fn() },
  load: { findMany: jest.fn() },
  invoice: { findMany: jest.fn() },
};

describe('CustomerScorecardService', () => {
  let service: CustomerScorecardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerScorecardService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CustomerScorecardService>(CustomerScorecardService);
  });

  it('should aggregate customer scorecard data', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: 1, companyName: 'Acme Corp' }]);
    mockPrisma.load.findMany.mockResolvedValue([
      {
        customerId: 1,
        rateCents: 100000,
        deliveredAt: new Date('2025-01-15T10:00:00Z'),
        deliveryDate: new Date('2025-01-15'),
        invoices: [{ totalCents: 105000 }],
      },
    ]);
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        customerId: 1,
        status: 'PAID',
        totalCents: 105000,
        balanceCents: 0,
        issueDate: new Date('2025-01-01'),
        paidDate: new Date('2025-01-20'),
      },
    ]);

    const result = await service.getCustomerScorecard(1, new Date('2025-01-01'), new Date('2025-01-31'));

    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe('Acme Corp');
    expect(result[0].revenueCents).toBe(105000);
    expect(result[0].avgPayDays).toBe(19);
    expect(result[0].onTimeDeliveryPercent).toBe(100);
  });

  it('should calculate outstanding balance', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: 1, companyName: 'Big Co' }]);
    mockPrisma.load.findMany.mockResolvedValue([
      {
        customerId: 1,
        rateCents: 50000,
        deliveredAt: new Date(),
        deliveryDate: null,
        invoices: [],
      },
    ]);
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        customerId: 1,
        status: 'SENT',
        totalCents: 50000,
        balanceCents: 50000,
        issueDate: null,
        paidDate: null,
      },
    ]);

    const result = await service.getCustomerScorecard(1, new Date(), new Date());

    expect(result[0].outstandingCents).toBe(50000);
  });
});
