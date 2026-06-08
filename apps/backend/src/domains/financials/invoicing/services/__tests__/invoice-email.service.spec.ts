import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvoiceEmailService } from '../invoice-email.service';
import { InvoicePdfService } from '../invoice-pdf.service';
import { DocBundleService } from '../doc-bundle.service';
import { FileStorageService } from '../../../../../infrastructure/storage/file-storage.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('InvoiceEmailService', () => {
  let service: InvoiceEmailService;
  let prisma: any;
  let pdfService: any;
  let docBundleService: any;
  let fileStorage: any;

  const mockInvoice = {
    invoiceNumber: 'INV-001',
    issueDate: new Date('2026-01-15'),
    dueDate: new Date('2026-02-15'),
    totalCents: 150000,
    balanceCents: 150000,
    paymentTermsDays: 30,
    status: 'SENT',
    customer: {
      companyName: 'Test Corp',
      billingEmail: 'billing@test.com',
      contacts: [{ isPrimary: true, email: 'contact@test.com' }],
    },
    load: { loadNumber: 'LD-100' },
  };

  beforeEach(async () => {
    prisma = {
      invoice: { findFirst: jest.fn().mockResolvedValue(mockInvoice) },
      invoiceSettings: {
        findUnique: jest.fn().mockResolvedValue({
          companyLegalName: 'Test LLC',
          replyToEmail: 'reply@test.com',
          emailSubjectTemplate: 'Invoice {{invoiceNumber}} from {{companyName}}',
          emailBodyTemplate: 'Dear {{customerName}}, please find attached.',
          remittanceInstructions: 'Wire to account 1234',
        }),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          companyName: 'Test LLC',
          contactEmail: 'info@test.com',
        }),
      },
    };
    pdfService = {
      generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf-data')),
    };
    docBundleService = {
      generateBundle: jest.fn().mockResolvedValue({
        buffer: Buffer.from('merged-bundle-bytes'),
        fileName: 'INV-001-bundle.pdf',
        format: 'MERGED_PDF',
        contentType: 'application/pdf',
        bundleS3Key: 'tenants/1/invoices/inv-1/bundle-123.pdf',
        bundleSizeBytes: 4_000_000,
        missingDocs: [],
        durationMs: 250,
      }),
    };
    fileStorage = {
      generatePresignedDownloadUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed?token=abc'),
    };

    const module = await Test.createTestingModule({
      providers: [
        InvoiceEmailService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicePdfService, useValue: pdfService },
        { provide: DocBundleService, useValue: docBundleService },
        { provide: FileStorageService, useValue: fileStorage },
      ],
    }).compile();

    service = module.get(InvoiceEmailService);
  });

  describe('buildEmailContent', () => {
    it('should throw NotFoundException for missing invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.buildEmailContent(1, 'inv-x')).rejects.toThrow(NotFoundException);
    });

    it('should build email content with merge fields', async () => {
      const result = await service.buildEmailContent(1, 'inv-1');
      expect(result.to).toBe('billing@test.com');
      expect(result.replyTo).toBe('reply@test.com');
      expect(result.subject).toContain('INV-001');
      expect(result.subject).toContain('Test LLC');
      expect(result.bodyHtml).toContain('INV-001');
      expect(result.invoiceNumber).toBe('INV-001');
    });

    it('should use primary contact email when billingEmail is missing', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...mockInvoice,
        customer: { ...mockInvoice.customer, billingEmail: null },
      });
      const result = await service.buildEmailContent(1, 'inv-1');
      expect(result.to).toBe('contact@test.com');
    });

    it('should return null for to when no email configured', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...mockInvoice,
        customer: {
          companyName: 'Test',
          billingEmail: null,
          contacts: [],
        },
      });
      const result = await service.buildEmailContent(1, 'inv-1');
      expect(result.to).toBeNull();
    });

    it('should handle no settings', async () => {
      prisma.invoiceSettings.findUnique.mockResolvedValue(null);
      const result = await service.buildEmailContent(1, 'inv-1');
      expect(result.subject).toContain('INV-001');
    });
  });

  describe('sendInvoice', () => {
    it('should throw when customer has no email', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...mockInvoice,
        customer: {
          companyName: 'Test',
          billingEmail: null,
          contacts: [],
        },
      });
      await expect(service.sendInvoice(1, 'inv-1')).rejects.toThrow(NotFoundException);
    });

    it('should send email without Resend when no API key', async () => {
      const origKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      const result = await service.sendInvoice(1, 'inv-1');
      expect(result.sent).toBe(true);
      expect(result.to).toBe('billing@test.com');
      if (origKey) process.env.RESEND_API_KEY = origKey;
    });
  });

  describe('sendToFactor — bundle attachment', () => {
    let resendSendSpy: jest.Mock;

    beforeEach(() => {
      resendSendSpy = jest.fn().mockResolvedValue({ id: 'msg-1' });
      // Inject a fake Resend client so we can capture send arguments without
      // hitting the network. The service caches whatever getResendClient()
      // returns, so we set it directly via a private-ish field.
      (service as unknown as { resendClient: unknown }).resendClient = {
        emails: { send: resendSendSpy },
      };
    });

    it('attaches the merged bundle PDF (not the invoice PDF) to the email', async () => {
      await service.sendToFactor(1, 'inv-1', 'factor@x.com');

      expect(docBundleService.generateBundle).toHaveBeenCalledWith(1, 'inv-1');
      expect(pdfService.generatePdf).not.toHaveBeenCalled(); // bundle service handles it
      expect(resendSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'factor@x.com',
          attachments: [
            expect.objectContaining({
              filename: 'INV-001-bundle.pdf',
              content: expect.any(Buffer),
            }),
          ],
        }),
      );
      expect(fileStorage.generatePresignedDownloadUrl).not.toHaveBeenCalled();
    });

    it('falls back to a signed S3 link in the email body when bundle > 20 MB', async () => {
      docBundleService.generateBundle.mockResolvedValueOnce({
        buffer: Buffer.alloc(21 * 1024 * 1024),
        fileName: 'INV-001-bundle.pdf',
        format: 'MERGED_PDF',
        contentType: 'application/pdf',
        bundleS3Key: 'tenants/1/invoices/inv-1/bundle-456.pdf',
        bundleSizeBytes: 21 * 1024 * 1024,
        missingDocs: [],
        durationMs: 400,
      });

      await service.sendToFactor(1, 'inv-1', 'factor@x.com');

      expect(resendSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'factor@x.com',
          attachments: [],
          html: expect.stringContaining('https://s3.example.com/signed?token=abc'),
        }),
      );
      expect(fileStorage.generatePresignedDownloadUrl).toHaveBeenCalledWith(
        'tenants/1/invoices/inv-1/bundle-456.pdf',
        expect.any(Number),
      );
    });

    it('HTML-escapes the signed S3 URL in the bundle-link fallback (defense-in-depth)', async () => {
      docBundleService.generateBundle.mockResolvedValueOnce({
        buffer: Buffer.alloc(21 * 1024 * 1024),
        fileName: 'INV-001-bundle.pdf',
        format: 'MERGED_PDF',
        contentType: 'application/pdf',
        bundleS3Key: 'tenants/1/invoices/inv-1/bundle-456.pdf',
        bundleSizeBytes: 21 * 1024 * 1024,
        missingDocs: [],
        durationMs: 400,
      });
      // Multiple query params + `&` is the canonical attribute-context smoke test.
      fileStorage.generatePresignedDownloadUrl.mockResolvedValueOnce(
        'https://s3.example.com/signed?token=abc&X-Amz-Signature=def&X-Amz-Date=20260429',
      );

      await service.sendToFactor(1, 'inv-1', 'factor@x.com');

      const html = (resendSendSpy.mock.calls[0][0] as { html: string }).html;
      expect(html).toContain('&amp;X-Amz-Signature=def');
      expect(html).not.toContain('&X-Amz-Signature=def'); // bare ampersand must not appear
    });

    it('attaches the bundle when size is exactly at the 20 MB threshold (boundary)', async () => {
      docBundleService.generateBundle.mockResolvedValueOnce({
        buffer: Buffer.alloc(20 * 1024 * 1024),
        fileName: 'INV-001-bundle.pdf',
        format: 'MERGED_PDF',
        contentType: 'application/pdf',
        bundleS3Key: 'tenants/1/invoices/inv-1/bundle-789.pdf',
        bundleSizeBytes: 20 * 1024 * 1024,
        missingDocs: [],
        durationMs: 400,
      });

      await service.sendToFactor(1, 'inv-1', 'factor@x.com');

      expect(fileStorage.generatePresignedDownloadUrl).not.toHaveBeenCalled();
      expect(resendSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([expect.objectContaining({ filename: 'INV-001-bundle.pdf' })]),
        }),
      );
    });

    it('throws NotFoundException when invoice does not exist', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(null);
      await expect(service.sendToFactor(1, 'missing', 'factor@x.com')).rejects.toThrow(NotFoundException);
      expect(docBundleService.generateBundle).not.toHaveBeenCalled();
    });

    // ─── Format-aware content-type (cleanup phase) ─────────────────

    it('attaches with content-type from bundle when format is MERGED_PDF', async () => {
      await service.sendToFactor(1, 'inv-1', 'factor@x.com');

      expect(resendSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: 'INV-001-bundle.pdf',
              content: expect.any(Buffer),
              contentType: 'application/pdf',
            }),
          ],
        }),
      );
    });

    it('attaches with content-type from bundle when format is ZIP', async () => {
      docBundleService.generateBundle.mockResolvedValueOnce({
        buffer: Buffer.from('zip-bytes'),
        fileName: 'INV-001-bundle.zip',
        format: 'ZIP',
        contentType: 'application/zip',
        bundleS3Key: 'tenants/1/invoices/inv-1/bundle-zip-1.zip',
        bundleSizeBytes: 9,
        missingDocs: [],
        durationMs: 80,
      });

      await service.sendToFactor(1, 'inv-1', 'factor@x.com');

      expect(resendSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              filename: 'INV-001-bundle.zip',
              content: expect.any(Buffer),
              contentType: 'application/zip',
            }),
          ],
        }),
      );
    });

    it('S3 link fallback works for ZIP bundles >20 MB (filename in download link is .zip)', async () => {
      docBundleService.generateBundle.mockResolvedValueOnce({
        buffer: Buffer.alloc(21 * 1024 * 1024),
        fileName: 'INV-001-bundle.zip',
        format: 'ZIP',
        contentType: 'application/zip',
        bundleS3Key: 'tenants/1/invoices/inv-1/bundle-big.zip',
        bundleSizeBytes: 21 * 1024 * 1024,
        missingDocs: [],
        durationMs: 800,
      });

      await service.sendToFactor(1, 'inv-1', 'factor@x.com');

      expect(resendSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [],
          html: expect.stringContaining('INV-001-bundle.zip'),
        }),
      );
      expect(fileStorage.generatePresignedDownloadUrl).toHaveBeenCalledWith(
        'tenants/1/invoices/inv-1/bundle-big.zip',
        expect.any(Number),
      );
    });
  });
});
