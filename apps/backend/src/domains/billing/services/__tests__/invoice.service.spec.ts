import { fixtureModel, tiedTimestamps, walkCursorList } from '@appshore/platform/test/helpers/cursor-walk';
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
    count: jest.fn(),
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

  describe('listInvoices: a cursor list, newest first', () => {
    it('reads one probe row past the page and hands out a cursor when it came back', async () => {
      const invoices = Array.from({ length: 21 }, (_, i) => ({
        id: `inv-${i}`,
        createdAt: new Date(Date.UTC(2026, 2, 1) - i * 1000),
      }));
      mockPrisma.billingInvoice.findMany.mockResolvedValue(invoices);
      mockPrisma.billingInvoice.count.mockResolvedValue(40);

      const result = await service.listInvoices(1, { limit: 20 });

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).not.toBeNull();
      expect(result.total).toBe(40);
      expect(mockPrisma.billingInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21 }),
      );
    });

    describe('walking pages over a fixture', () => {
      // A billing run writes several invoices in one millisecond; one belongs to another tenant.
      const stamps = tiedTimestamps(7);
      const rows = stamps.map((createdAt, index) => ({
        id: `inv_${(index * 3) % 7}`,
        tenantId: index === 6 ? 2 : 1,
        status: 'PAID',
        createdAt,
      }));

      beforeEach(() => Object.assign(mockPrisma.billingInvoice, fixtureModel(rows)));

      it('returns every invoice of the tenant once, ties included, and none of another tenant', async () => {
        const totals: number[] = [];
        const { pages, items } = await walkCursorList(async (cursor) => {
          const page = await service.listInvoices(1, { limit: 4, cursor });
          totals.push(page.total);
          return page;
        });

        expect(pages.map((page) => page.length)).toEqual([4, 2]);
        expect(new Set(items.map((invoice) => invoice.id)).size).toBe(6);
        expect(items.every((invoice) => invoice.tenantId === 1)).toBe(true);
        const times = items.map((invoice) => invoice.createdAt.getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(totals).toEqual([6, 6]);
      });

      it('answers 400 on a cursor it did not issue (the old row-id cursor included), before any query runs', async () => {
        await expect(service.listInvoices(1, { cursor: 'inv_3' })).rejects.toMatchObject({ status: 400 });
        expect(mockPrisma.billingInvoice.findMany).not.toHaveBeenCalled();
      });
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
