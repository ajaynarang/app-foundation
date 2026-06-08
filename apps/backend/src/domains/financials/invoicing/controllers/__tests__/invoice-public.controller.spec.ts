import { Test, TestingModule } from '@nestjs/testing';
import { InvoicePublicController } from '../invoice-public.controller';
import { InvoiceShareService } from '../../services/invoice-share.service';
import { InvoicePdfService } from '../../services/invoice-pdf.service';

describe('InvoicePublicController', () => {
  let controller: InvoicePublicController;

  const mockInvoiceShareService = {
    getInvoiceByToken: jest.fn(),
    getShareLinkByToken: jest.fn(),
  };

  const mockInvoicePdfService = {
    generatePdf: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoicePublicController],
      providers: [
        { provide: InvoiceShareService, useValue: mockInvoiceShareService },
        { provide: InvoicePdfService, useValue: mockInvoicePdfService },
      ],
    }).compile();

    controller = module.get<InvoicePublicController>(InvoicePublicController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /:token (viewInvoice)', () => {
    it('should return invoice data by token', async () => {
      const invoiceData = {
        invoiceNumber: 'INV-2026-0001',
        status: 'SENT',
        customerName: 'Acme Corp',
        totalCents: 250000,
        lineItems: [],
      };
      mockInvoiceShareService.getInvoiceByToken.mockResolvedValue(invoiceData);

      const result = await controller.viewInvoice('some-token');

      expect(mockInvoiceShareService.getInvoiceByToken).toHaveBeenCalledWith('some-token');
      expect(result).toEqual(invoiceData);
    });

    it('should propagate NotFoundException from service', async () => {
      mockInvoiceShareService.getInvoiceByToken.mockRejectedValue(new Error('Invalid share link'));

      await expect(controller.viewInvoice('bad-token')).rejects.toThrow('Invalid share link');
    });
  });

  describe('GET /:token/pdf (downloadPdf)', () => {
    it('should generate PDF and stream response with correct headers', async () => {
      const shareLink = {
        invoice: {
          tenantId: 1,
          invoiceNumber: 'INV-2026-0001',
          status: 'SENT',
        },
      };
      const pdfBuffer = Buffer.from('fake-pdf-content');

      mockInvoiceShareService.getShareLinkByToken.mockResolvedValue(shareLink);
      mockInvoicePdfService.generatePdf.mockResolvedValue(pdfBuffer);

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as any;

      await controller.downloadPdf('valid-token', mockRes);

      expect(mockInvoiceShareService.getShareLinkByToken).toHaveBeenCalledWith('valid-token');
      expect(mockInvoicePdfService.generatePdf).toHaveBeenCalledWith(1, 'INV-2026-0001');
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="INV-2026-0001.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      });
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should propagate error when token is invalid', async () => {
      mockInvoiceShareService.getShareLinkByToken.mockRejectedValue(new Error('Invalid share link'));

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await expect(controller.downloadPdf('bad-token', mockRes)).rejects.toThrow('Invalid share link');
    });

    it('should propagate error when PDF generation fails', async () => {
      const shareLink = {
        invoice: {
          tenantId: 1,
          invoiceNumber: 'INV-2026-0001',
          status: 'SENT',
        },
      };
      mockInvoiceShareService.getShareLinkByToken.mockResolvedValue(shareLink);
      mockInvoicePdfService.generatePdf.mockRejectedValue(new Error('PDF generation failed'));

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await expect(controller.downloadPdf('valid-token', mockRes)).rejects.toThrow('PDF generation failed');
    });
  });
});
