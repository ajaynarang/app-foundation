import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvoiceService } from '../invoice.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PaymentProviderFactory } from '../../adapters/payment-provider.factory';

const mockAdapter = {
  getUpcomingInvoice: jest.fn(),
};

const mockPrisma = {
  billingCustomer: { findUnique: jest.fn() },
  billingInvoice: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockProviderFactory = {
  getAdapter: jest.fn().mockReturnValue(mockAdapter),
};

describe('InvoiceService', () => {
  let service: InvoiceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaymentProviderFactory, useValue: mockProviderFactory },
      ],
    }).compile();
    service = module.get<InvoiceService>(InvoiceService);
  });

  describe('syncInvoice', () => {
    it('should skip if billing customer not found', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);
      await service.syncInvoice({
        data: { id: 'inv_1', customer: 'cus_1', lines: { data: [] } },
      } as any);
      expect(mockPrisma.billingInvoice.upsert).not.toHaveBeenCalled();
    });

    it('should upsert invoice from webhook data', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
      });
      mockPrisma.billingInvoice.upsert.mockResolvedValue({});

      await service.syncInvoice({
        data: {
          id: 'inv_1',
          customer: 'cus_1',
          status: 'paid',
          amount_due: 5000,
          amount_paid: 5000,
          tax: 0,
          lines: { data: [] },
          period_start: 1700000000,
          period_end: 1702592000,
          invoice_pdf: 'https://pdf.url',
          hosted_invoice_url: 'https://hosted.url',
          status_transitions: { paid_at: 1700100000 },
        },
      } as any);

      expect(mockPrisma.billingInvoice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { providerInvoiceId: 'inv_1' },
        }),
      );
    });
  });

  describe('listInvoices', () => {
    it('should return paginated invoices', async () => {
      const invoices = Array.from({ length: 21 }, (_, i) => ({
        id: `inv-${i}`,
      }));
      mockPrisma.billingInvoice.findMany.mockResolvedValue(invoices);

      const result = await service.listInvoices(1, { limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('getUpcomingInvoice', () => {
    it('should throw if no billing customer', async () => {
      mockPrisma.billingCustomer.findUnique.mockResolvedValue(null);
      await expect(service.getUpcomingInvoice(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('downloadInvoice', () => {
    it('should throw if invoice not found', async () => {
      mockPrisma.billingInvoice.findFirst.mockResolvedValue(null);
      await expect(service.downloadInvoice(1, 'inv-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw if no PDF URL', async () => {
      mockPrisma.billingInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        pdfUrl: null,
      });
      await expect(service.downloadInvoice(1, 'inv-1')).rejects.toThrow(NotFoundException);
    });

    it('should return PDF and hosted URLs', async () => {
      mockPrisma.billingInvoice.findFirst.mockResolvedValue({
        pdfUrl: 'https://pdf.url',
        hostedInvoiceUrl: 'https://hosted.url',
      });
      const result = await service.downloadInvoice(1, 'inv-1');
      expect(result.pdfUrl).toBe('https://pdf.url');
    });
  });
});
