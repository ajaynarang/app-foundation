import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceShareService } from '../invoice-share.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('InvoiceShareService', () => {
  let service: InvoiceShareService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      invoice: { findFirst: jest.fn() },
      invoiceShareLink: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [InvoiceShareService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(InvoiceShareService);
  });

  describe('createShareLink', () => {
    it('should throw when invoice not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.createShareLink(1, 'inv-x')).rejects.toThrow(NotFoundException);
    });

    it('should throw when invoice is voided', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 1, status: 'VOID' });
      await expect(service.createShareLink(1, 'inv-1')).rejects.toThrow(BadRequestException);
    });

    it('should create share link and return URL', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 1, status: 'SENT' });
      const result = await service.createShareLink(1, 'inv-1');
      expect(result.url).toContain('/api/v1/invoices/public/');
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('getShareLinkByToken', () => {
    it('should throw for invalid token', async () => {
      prisma.invoiceShareLink.findUnique.mockResolvedValue(null);
      await expect(service.getShareLinkByToken('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('should throw for expired link', async () => {
      prisma.invoiceShareLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() - 86400000),
        invoice: { status: 'SENT' },
      });
      await expect(service.getShareLinkByToken('token')).rejects.toThrow(BadRequestException);
    });

    it('should throw for voided invoice', async () => {
      prisma.invoiceShareLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 86400000),
        invoice: { status: 'VOID' },
      });
      await expect(service.getShareLinkByToken('token')).rejects.toThrow(BadRequestException);
    });

    it('should return valid link', async () => {
      const link = {
        expiresAt: new Date(Date.now() + 86400000),
        invoice: {
          tenantId: 1,
          invoiceNumber: 'INV-001',
          status: 'SENT',
        },
      };
      prisma.invoiceShareLink.findUnique.mockResolvedValue(link);
      const result = await service.getShareLinkByToken('valid-token');
      expect(result.invoice.invoiceNumber).toBe('INV-001');
    });
  });

  describe('getInvoiceByToken', () => {
    it('should throw for invalid token', async () => {
      prisma.invoiceShareLink.findUnique.mockResolvedValue(null);
      await expect(service.getInvoiceByToken('bad')).rejects.toThrow(NotFoundException);
    });

    it('should return invoice data for valid token', async () => {
      prisma.invoiceShareLink.findUnique.mockResolvedValue({
        expiresAt: new Date(Date.now() + 86400000),
        invoice: {
          invoiceNumber: 'INV-001',
          status: 'SENT',
          customer: { companyName: 'Test' },
          issueDate: new Date(),
          dueDate: new Date(),
          subtotalCents: 100000,
          adjustmentCents: 0,
          totalCents: 100000,
          paidCents: 0,
          balanceCents: 100000,
          paymentTermsDays: 30,
          lineItems: [
            {
              type: 'LINEHAUL',
              description: 'test',
              quantity: 1,
              unitPriceCents: 100000,
              totalCents: 100000,
            },
          ],
        },
      });
      const result = await service.getInvoiceByToken('valid-token');
      expect(result.invoiceNumber).toBe('INV-001');
      expect(result.lineItems).toHaveLength(1);
    });
  });
});
