import { Test, TestingModule } from '@nestjs/testing';
import { InvoicingController } from '../invoicing.controller';
import { InvoicingService } from '../../services/invoicing.service';
import { PaymentsService } from '../../../payments/services/payments.service';
import { InvoiceSettingsService } from '../../services/invoice-settings.service';
import { InvoicePdfService } from '../../services/invoice-pdf.service';
import { InvoiceEmailService } from '../../services/invoice-email.service';
import { InvoiceShareService } from '../../services/invoice-share.service';
import { FactoringService } from '../../services/factoring.service';
import { NoaService } from '../../services/noa.service';
import { DocBundleService } from '../../services/doc-bundle.service';
import { FactoringContactsService } from '../../services/factoring-contacts.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('InvoicingController', () => {
  let controller: InvoicingController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    customer: { findFirst: jest.fn() },
  };

  const mockInvoicingService = {
    generateFromLoad: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    markSent: jest.fn(),
    voidInvoice: jest.fn(),
    getSummary: jest.fn(),
    batchGenerate: jest.fn(),
    batchSend: jest.fn(),
    batchVoid: jest.fn(),
    batchMarkPaid: jest.fn(),
    reInvoice: jest.fn(),
    getCustomerPaymentStats: jest.fn(),
  };

  const mockPaymentsService = {
    recordPayment: jest.fn(),
  };

  const mockInvoiceSettingsService = {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  };

  const mockInvoicePdfService = {
    generatePdf: jest.fn(),
  };

  const mockInvoiceEmailService = {
    sendInvoice: jest.fn(),
    buildEmailContent: jest.fn(),
  };

  const mockInvoiceShareService = {
    createShareLink: jest.fn(),
  };

  const mockFactoringService = {
    listCompanies: jest.fn(),
    createCompany: jest.fn(),
    updateCompany: jest.fn(),
    deleteCompany: jest.fn(),
    submitToFactor: jest.fn(),
    batchSubmitToFactor: jest.fn(),
    recordAdvance: jest.fn(),
    recordFee: jest.fn(),
    recordReserveRelease: jest.fn(),
    recordChargeback: jest.fn(),
    recordChargebackReversal: jest.fn(),
    deleteFactoringTransaction: jest.fn(),
    listFactoringTransactions: jest.fn(),
    getFactoringSummary: jest.fn(),
  };

  const mockNoaService = {
    listNoaRecords: jest.fn(),
    createNoaRecord: jest.fn(),
    updateNoaStatus: jest.fn(),
    checkNoaForInvoice: jest.fn(),
    deleteNoaRecord: jest.fn(),
    listNoaInbox: jest.fn(),
    sendNoaEmail: jest.fn(),
    bulkCreateForFactorChange: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoicingController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoicingService, useValue: mockInvoicingService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        {
          provide: InvoiceSettingsService,
          useValue: mockInvoiceSettingsService,
        },
        { provide: InvoicePdfService, useValue: mockInvoicePdfService },
        { provide: InvoiceEmailService, useValue: mockInvoiceEmailService },
        { provide: InvoiceShareService, useValue: mockInvoiceShareService },
        { provide: FactoringService, useValue: mockFactoringService },
        { provide: NoaService, useValue: mockNoaService },
        {
          provide: DocBundleService,
          useValue: {
            getDocumentList: jest.fn(),
            validateBundleReady: jest.fn(),
            generateBundle: jest.fn(),
          },
        },
        {
          provide: FactoringContactsService,
          useValue: {
            list: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<InvoicingController>(InvoicingController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /generate/:load_id', () => {
    it('should generate invoice from load', async () => {
      const invoice = { invoiceNumber: 'INV-1' };
      mockInvoicingService.generateFromLoad.mockResolvedValue(invoice);

      const result = await controller.generateFromLoad(mockUser, 'LD-1', {
        paymentTermsDays: 30,
      });

      expect(mockInvoicingService.generateFromLoad).toHaveBeenCalledWith(1, 'LD-1', { paymentTermsDays: 30 });
      expect(result).toEqual(invoice);
    });
  });

  describe('GET /', () => {
    it('should list invoices with filters', async () => {
      const expected = { items: [], total: 0 };
      mockInvoicingService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(
        mockUser,
        'draft', // status
        undefined, // customerId
        undefined, // overdueOnly
        undefined, // minDaysOverdue
        undefined, // search
        undefined, // sortBy
        undefined, // sortOrder
        undefined, // dateFrom
        undefined, // dateTo
        undefined, // billingPath
        '50', // limit
        '0', // offset
      );

      expect(mockInvoicingService.findAll).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'draft' }), {
        limit: 50,
        offset: 0,
      });
      expect(result).toEqual(expected);
    });
  });

  describe('GET /summary', () => {
    it('should return AR summary', async () => {
      const summary = { totalOutstanding: 50000 };
      mockInvoicingService.getSummary.mockResolvedValue(summary);

      const result = await controller.getSummary(mockUser);
      expect(mockInvoicingService.getSummary).toHaveBeenCalledWith(1);
      expect(result).toEqual(summary);
    });
  });

  describe('GET /:invoice_id', () => {
    it('should return invoice detail', async () => {
      const invoice = { invoiceNumber: 'INV-1', status: 'draft' };
      mockInvoicingService.findOne.mockResolvedValue(invoice);

      const result = await controller.findOne(mockUser, 'INV-1');
      expect(mockInvoicingService.findOne).toHaveBeenCalledWith(1, 'INV-1');
      expect(result).toEqual(invoice);
    });
  });

  describe('PATCH /:invoice_id', () => {
    it('should update invoice', async () => {
      const dto = { notes: 'Updated' } as any;
      mockInvoicingService.update.mockResolvedValue({ invoiceNumber: 'INV-1' });

      await controller.update(mockUser, 'INV-1', dto);
      expect(mockInvoicingService.update).toHaveBeenCalledWith(1, 'INV-1', dto);
    });
  });

  describe('POST /:invoice_id/send', () => {
    it('should mark as sent', async () => {
      mockInvoicingService.markSent.mockResolvedValue({ status: 'sent' });

      await controller.markSent(mockUser, 'INV-1', { sendEmail: false });
      expect(mockInvoicingService.markSent).toHaveBeenCalledWith(1, 'INV-1');
      expect(mockInvoiceEmailService.sendInvoice).not.toHaveBeenCalled();
    });

    it('should also send email when sendEmail is true', async () => {
      mockInvoicingService.markSent.mockResolvedValue({ status: 'sent' });
      mockInvoiceEmailService.sendInvoice.mockResolvedValue(undefined);

      await controller.markSent(mockUser, 'INV-1', { sendEmail: true });
      expect(mockInvoiceEmailService.sendInvoice).toHaveBeenCalledWith(1, 'INV-1');
    });
  });

  describe('POST /:invoice_id/void', () => {
    it('should void invoice', async () => {
      mockInvoicingService.voidInvoice.mockResolvedValue({ status: 'voided' });

      await controller.voidInvoice(mockUser, 'INV-1');
      expect(mockInvoicingService.voidInvoice).toHaveBeenCalledWith(1, 'INV-1');
    });
  });

  describe('POST /:invoice_id/payments', () => {
    it('should record payment', async () => {
      const dto = { amountCents: 5000, paymentMethod: 'check' } as any;
      mockPaymentsService.recordPayment.mockResolvedValue({ id: 1 });

      await controller.recordPayment(mockUser, 'INV-1', dto);
      expect(mockPaymentsService.recordPayment).toHaveBeenCalledWith(1, 'INV-1', dto, 1);
    });
  });

  describe('POST /:invoice_id/resend', () => {
    it('should resend invoice email', async () => {
      mockInvoiceEmailService.sendInvoice.mockResolvedValue(undefined);

      await controller.resendInvoice(mockUser, 'INV-1');
      expect(mockInvoiceEmailService.sendInvoice).toHaveBeenCalledWith(1, 'INV-1');
    });
  });

  describe('POST /:invoice_id/share', () => {
    it('should create share link', async () => {
      mockInvoiceShareService.createShareLink.mockResolvedValue({
        url: 'https://...',
      });

      await controller.createShareLink(mockUser, 'INV-1');
      expect(mockInvoiceShareService.createShareLink).toHaveBeenCalledWith(1, 'INV-1');
    });
  });

  describe('POST /:invoice_id/reinvoice', () => {
    it('should reinvoice', async () => {
      mockInvoicingService.reInvoice.mockResolvedValue({ invoiceNumber: 'INV-2' });

      await controller.reInvoice(mockUser, 'INV-1');
      expect(mockInvoicingService.reInvoice).toHaveBeenCalledWith(1, 'INV-1');
    });
  });

  describe('GET /settings', () => {
    it('should get settings', async () => {
      mockInvoiceSettingsService.getSettings.mockResolvedValue({
        paymentTermsDays: 30,
      });

      await controller.getSettings(mockUser);
      expect(mockInvoiceSettingsService.getSettings).toHaveBeenCalledWith(1);
    });
  });

  describe('PATCH /settings', () => {
    it('should update settings', async () => {
      const dto = { paymentTermsDays: 45 } as any;
      mockInvoiceSettingsService.updateSettings.mockResolvedValue(dto);

      await controller.updateSettings(mockUser, dto);
      expect(mockInvoiceSettingsService.updateSettings).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('Batch operations', () => {
    it('POST /batch/generate should batch generate', async () => {
      mockInvoicingService.batchGenerate.mockResolvedValue({ count: 2 });

      await controller.batchGenerate(mockUser, {
        loadIds: ['LD-1', 'LD-2'],
        paymentTermsDays: 30,
      } as any);

      expect(mockInvoicingService.batchGenerate).toHaveBeenCalledWith(1, ['LD-1', 'LD-2'], { paymentTermsDays: 30 });
    });

    it('POST /batch/send should batch send', async () => {
      mockInvoicingService.batchSend.mockResolvedValue({ count: 2 });

      await controller.batchSend(mockUser, {
        invoiceIds: ['INV-1', 'INV-2'],
      } as any);

      expect(mockInvoicingService.batchSend).toHaveBeenCalledWith(1, ['INV-1', 'INV-2']);
    });

    it('POST /batch/void should batch void', async () => {
      mockInvoicingService.batchVoid.mockResolvedValue({ count: 1 });

      await controller.batchVoid(mockUser, {
        invoiceIds: ['INV-1'],
      } as any);

      expect(mockInvoicingService.batchVoid).toHaveBeenCalledWith(1, ['INV-1']);
    });
  });

  describe('GET /customers/:customer_id/payment-stats', () => {
    it('should return payment stats', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue({ id: 5 });
      mockInvoicingService.getCustomerPaymentStats.mockResolvedValue({
        avgDays: 25,
      });

      await controller.getCustomerPaymentStats(mockUser, 'CUST-1');

      expect(mockInvoicingService.getCustomerPaymentStats).toHaveBeenCalledWith(1, 5);
    });

    it('should throw NotFoundException if customer not found', async () => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);

      await expect(controller.getCustomerPaymentStats(mockUser, 'CUST-NOT')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Factoring endpoints', () => {
    it('GET /factoring-companies should list companies', async () => {
      mockFactoringService.listCompanies.mockResolvedValue([]);

      await controller.listFactoringCompanies(mockUser);
      expect(mockFactoringService.listCompanies).toHaveBeenCalledWith(1);
    });

    // POST /:invoice_id/factor (legacy) was DELETED in Phase 4A.
    // Single submit flow lives in POST /:invoice_id/submit-to-factor (now also
    // transitions SENT → FACTORED).
  });

  describe('GET /:invoice_id/email-preview', () => {
    it('should return email preview', async () => {
      mockInvoiceEmailService.buildEmailContent.mockResolvedValue({
        subject: 'Invoice',
        html: '<p>Invoice</p>',
      });

      await controller.emailPreview(mockUser, 'INV-1');
      expect(mockInvoiceEmailService.buildEmailContent).toHaveBeenCalledWith(1, 'INV-1');
    });
  });

  describe('POST / (create)', () => {
    it('should create invoice with manual line items', async () => {
      const dto = {
        loadId: 'LD-1',
        paymentTermsDays: 30,
        notes: 'Test',
        internalNotes: 'Internal',
      } as any;
      mockInvoicingService.generateFromLoad.mockResolvedValue({
        invoiceNumber: 'INV-1',
      });

      await controller.create(mockUser, dto);

      expect(mockInvoicingService.generateFromLoad).toHaveBeenCalledWith(1, 'LD-1', {
        paymentTermsDays: 30,
        notes: 'Test',
        internalNotes: 'Internal',
      });
    });
  });

  describe('POST /batch/mark-paid', () => {
    it('should batch mark invoices as paid', async () => {
      mockInvoicingService.batchMarkPaid.mockResolvedValue({
        paid: 2,
        skipped: 0,
      });

      const dto = {
        invoiceIds: ['INV-1', 'INV-2'],
        paymentDate: '2026-03-15',
        paymentMethod: 'check',
      } as any;

      await controller.batchMarkPaid(mockUser, dto);

      expect(mockInvoicingService.batchMarkPaid).toHaveBeenCalledWith(1, ['INV-1', 'INV-2'], {
        paymentDate: '2026-03-15',
        paymentMethod: 'check',
      });
    });
  });

  describe('NOA records', () => {
    it('GET /noa-records should list NOA records', async () => {
      mockNoaService.listNoaRecords.mockResolvedValue([]);

      await controller.listNoaRecords(mockUser, '5');
      expect(mockNoaService.listNoaRecords).toHaveBeenCalledWith(1, 5);
    });

    it('GET /noa-records should handle no customerId', async () => {
      mockNoaService.listNoaRecords.mockResolvedValue([]);

      await controller.listNoaRecords(mockUser, undefined);
      expect(mockNoaService.listNoaRecords).toHaveBeenCalledWith(1, undefined);
    });

    it('POST /noa-records should create NOA record', async () => {
      const dto = { customerId: 5, factoringCompanyId: 'FC-1' } as any;
      mockNoaService.createNoaRecord.mockResolvedValue({ id: 1 });

      await controller.createNoaRecord(mockUser, dto);
      expect(mockNoaService.createNoaRecord).toHaveBeenCalledWith(1, dto);
    });

    it('PATCH /noa-records/:noa_id/status should update status', async () => {
      const dto = { status: 'ACKNOWLEDGED' } as any;
      mockNoaService.updateNoaStatus.mockResolvedValue({
        status: 'ACKNOWLEDGED',
      });

      await controller.updateNoaStatus(mockUser, 'noa-1', dto);
      expect(mockNoaService.updateNoaStatus).toHaveBeenCalledWith(1, 'noa-1', dto);
    });

    it('DELETE /noa-records/:noa_id should delete', async () => {
      mockNoaService.deleteNoaRecord.mockResolvedValue({ deleted: true });

      await controller.deleteNoaRecord(mockUser, 'noa-1');
      expect(mockNoaService.deleteNoaRecord).toHaveBeenCalledWith(1, 'noa-1');
    });

    it('GET /noa-records/inbox should list with filters parsed from query', async () => {
      mockNoaService.listNoaInbox.mockResolvedValue({ items: [], total: 0 });

      await controller.listNoaInbox(mockUser, 'SENT', '7', '12', 'pending_gt_14', '25', '0');

      expect(mockNoaService.listNoaInbox).toHaveBeenCalledWith(1, {
        status: 'SENT',
        factorId: 7,
        customerId: 12,
        ageBucket: 'pending_gt_14',
        limit: 25,
        offset: 0,
      });
    });

    it('POST /noa-records/:noa_id/send should call sendNoaEmail', async () => {
      mockNoaService.sendNoaEmail.mockResolvedValue({ sent: true, to: 'broker@x.com' });

      const result = await controller.sendNoa(mockUser, 'noa-7');

      expect(mockNoaService.sendNoaEmail).toHaveBeenCalledWith(1, 'noa-7');
      expect(result).toEqual({ sent: true, to: 'broker@x.com' });
    });

    it('POST /noa-records/bulk-for-factor-change should call bulkCreateForFactorChange', async () => {
      mockNoaService.bulkCreateForFactorChange.mockResolvedValue({ created: 4, skipped: 1, customerIds: [1, 2, 3, 4] });

      const result = await controller.bulkCreateForFactorChange(mockUser, { newFactoringCompanyId: 9 });

      expect(mockNoaService.bulkCreateForFactorChange).toHaveBeenCalledWith(1, 9);
      expect(result.created).toBe(4);
    });
  });

  describe('Factoring company CRUD', () => {
    it('POST /factoring-companies should create company', async () => {
      const dto = { name: 'Factor Co' } as any;
      mockFactoringService.createCompany.mockResolvedValue({ id: 1 });

      await controller.createFactoringCompany(mockUser, dto);
      expect(mockFactoringService.createCompany).toHaveBeenCalledWith(1, dto);
    });

    it('PATCH /factoring-companies/:company_id should update company', async () => {
      const dto = { name: 'Updated Co' } as any;
      mockFactoringService.updateCompany.mockResolvedValue({
        name: 'Updated Co',
      });

      await controller.updateFactoringCompany(mockUser, 'FC-1', dto);
      expect(mockFactoringService.updateCompany).toHaveBeenCalledWith(1, 'FC-1', dto);
    });

    it('DELETE /factoring-companies/:company_id should delete company', async () => {
      mockFactoringService.deleteCompany.mockResolvedValue({ deleted: true });

      await controller.deleteFactoringCompany(mockUser, 'FC-1');
      expect(mockFactoringService.deleteCompany).toHaveBeenCalledWith(1, 'FC-1');
    });
  });

  describe('Factoring contacts', () => {
    let mockFactoringContactsService: any;

    beforeEach(() => {
      mockFactoringContactsService = (controller as any).factoringContactsService;
    });

    it('GET /factoring-companies/:companyId/contacts should list contacts', async () => {
      mockFactoringContactsService.list.mockResolvedValue([]);

      await controller.listFactoringContacts(mockUser, 5);
      expect(mockFactoringContactsService.list).toHaveBeenCalledWith(1, 5);
    });

    it('POST /factoring-companies/:companyId/contacts should create contact', async () => {
      const dto = { firstName: 'Jane', lastName: 'Doe' } as any;
      mockFactoringContactsService.create.mockResolvedValue({ id: 1 });

      await controller.createFactoringContact(mockUser, 5, dto);
      expect(mockFactoringContactsService.create).toHaveBeenCalledWith(1, 5, dto);
    });

    it('PATCH /factoring-contacts/:contactId should update contact', async () => {
      const dto = { email: 'new@test.com' } as any;
      mockFactoringContactsService.update.mockResolvedValue({
        email: 'new@test.com',
      });

      await controller.updateFactoringContact(mockUser, 'fc-1', dto);
      expect(mockFactoringContactsService.update).toHaveBeenCalledWith(1, 'fc-1', dto);
    });

    it('DELETE /factoring-contacts/:contactId should delete contact', async () => {
      mockFactoringContactsService.delete.mockResolvedValue({ deleted: true });

      await controller.deleteFactoringContact(mockUser, 'fc-1');
      expect(mockFactoringContactsService.delete).toHaveBeenCalledWith(1, 'fc-1');
    });
  });

  describe('POST /batch/submit-to-factor', () => {
    it('should batch submit invoices to factoring company', async () => {
      mockFactoringService.batchSubmitToFactor.mockResolvedValue({
        submitted: 2,
      });

      const body = {
        invoiceIds: ['INV-1', 'INV-2'],
        factoringCompanyId: 'FC-1',
        factoringReference: 'REF-001',
        sendEmail: true,
      };

      await controller.batchSubmitToFactor(mockUser, body);

      expect(mockFactoringService.batchSubmitToFactor).toHaveBeenCalledWith(1, ['INV-1', 'INV-2'], {
        factoringCompanyId: 'FC-1',
        factoringReference: 'REF-001',
        sendEmail: true,
      });
    });
  });

  // POST /batch/factor (legacy) was DELETED in Phase 4A.
  // Use POST /batch/submit-to-factor — covered above.

  describe('POST /:invoice_id/submit-to-factor', () => {
    it('should submit single invoice to factoring', async () => {
      const dto = { factoringCompanyId: 'FC-1' } as any;
      mockFactoringService.submitToFactor.mockResolvedValue({
        submitted: true,
      });

      await controller.submitToFactor(mockUser, 'INV-1', dto);

      expect(mockFactoringService.submitToFactor).toHaveBeenCalledWith(1, 'INV-1', dto);
    });
  });

  describe('GET /:invoice_id/doc-bundle (DocBundleInfo response)', () => {
    it('returns invoiceNumber, loadId, ready, docs[], missing[] in canonical order INVOICE → RATE_CON → BOL → POD', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      mockDocBundleService.getDocumentList.mockResolvedValue({
        documents: [
          { documentType: 'RATE_CON', s3Key: 'rc' },
          { documentType: 'BOL', s3Key: 'bol' },
        ],
        missing: ['POD'],
        invoiceNumber: 'INV-1',
        loadId: 10,
      });
      mockDocBundleService.validateBundleReady.mockResolvedValue({
        ready: false,
        missing: ['POD'],
      });

      const result = await controller.getDocBundle(mockUser, 'INV-1');

      expect(result.invoiceNumber).toBe('INV-1');
      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(['POD']);
      expect(result.docs.map((d) => d.type)).toEqual(['INVOICE', 'RATE_CON', 'BOL', 'POD']);
      expect(result.docs.find((d) => d.type === 'INVOICE')?.available).toBe(true);
      expect(result.docs.find((d) => d.type === 'RATE_CON')?.available).toBe(true);
      expect(result.docs.find((d) => d.type === 'BOL')?.available).toBe(true);

      const podRow = result.docs.find((d) => d.type === 'POD');
      expect(podRow.available).toBe(false);
      expect(podRow.uploadUrl).toBe('/dispatcher/loads?open=10&tab=docs');
    });

    it('returns ready=true when all required source docs are present', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      mockDocBundleService.getDocumentList.mockResolvedValue({
        documents: [
          { documentType: 'RATE_CON', s3Key: 'rc' },
          { documentType: 'BOL', s3Key: 'bol' },
          { documentType: 'POD', s3Key: 'pod' },
        ],
        missing: [],
        invoiceNumber: 'INV-1',
        loadId: 10,
      });
      mockDocBundleService.validateBundleReady.mockResolvedValue({ ready: true, missing: [] });

      const result = await controller.getDocBundle(mockUser, 'INV-1');
      expect(result.ready).toBe(true);
      expect(result.docs.every((d) => d.available)).toBe(true);
      expect(result.docs.every((d) => !d.uploadUrl)).toBe(true);
    });
  });

  describe('GET /:invoice_id/bundle-preview', () => {
    it('streams the merged PDF inline with content-type application/pdf', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      const pdfBuffer = Buffer.from('merged-bytes');
      mockDocBundleService.generateBundle.mockResolvedValue({
        buffer: pdfBuffer,
        fileName: 'INV-X-bundle.pdf',
        format: 'MERGED_PDF',
        contentType: 'application/pdf',
        bundleS3Key: 'tenants/1/invoices/INV-1/bundle-1.pdf',
        bundleSizeBytes: pdfBuffer.length,
        missingDocs: [],
        durationMs: 100,
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.previewBundle(mockUser, 'INV-1', mockRes);

      expect(mockDocBundleService.generateBundle).toHaveBeenCalledWith(1, 'INV-1');
      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Content-Length': pdfBuffer.length.toString(),
        }),
      );
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('streams ZIP as attachment with content-type application/zip when bundle.format=ZIP', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      const zipBuffer = Buffer.from('zip-bytes');
      mockDocBundleService.generateBundle.mockResolvedValue({
        buffer: zipBuffer,
        fileName: 'INV-Z-bundle.zip',
        format: 'ZIP',
        contentType: 'application/zip',
        bundleS3Key: 'tenants/1/invoices/INV-Z/bundle-1.zip',
        bundleSizeBytes: zipBuffer.length,
        missingDocs: [],
        durationMs: 100,
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.previewBundle(mockUser, 'INV-Z', mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="INV-Z-bundle.zip"',
          'Content-Length': zipBuffer.length.toString(),
        }),
      );
      expect(mockRes.end).toHaveBeenCalledWith(zipBuffer);
    });

    it('propagates BadRequestException when bundle generation fails (corrupt source)', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      const { BadRequestException } = await import('@nestjs/common');
      mockDocBundleService.generateBundle.mockRejectedValue(
        new BadRequestException('Bill of Lading is not a valid PDF'),
      );

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await expect(controller.previewBundle(mockUser, 'INV-1', mockRes)).rejects.toThrow(BadRequestException);
      expect(mockRes.end).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException — cross-tenant isolation enforced by service-level findFirst({tenantId})', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      const { NotFoundException: NotFound } = await import('@nestjs/common');
      mockDocBundleService.generateBundle.mockRejectedValue(new NotFound('Invoice not found'));

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await expect(controller.previewBundle(mockUser, 'INV-foreign', mockRes)).rejects.toThrow(NotFound);
    });
  });

  describe('GET /:invoice_id/doc-bundle/download', () => {
    it('should download doc bundle as PDF when bundle.format=MERGED_PDF', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      const pdfBuffer = Buffer.from('pdf-data');
      mockDocBundleService.generateBundle.mockResolvedValue({
        buffer: pdfBuffer,
        fileName: 'INV-2026-0001-bundle.pdf',
        format: 'MERGED_PDF',
        contentType: 'application/pdf',
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.downloadDocBundle(mockUser, 'INV-1', mockRes);

      expect(mockDocBundleService.generateBundle).toHaveBeenCalledWith(1, 'INV-1');
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="INV-2026-0001-bundle.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      });
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should download doc bundle as ZIP when bundle.format=ZIP', async () => {
      const mockDocBundleService = (controller as any).docBundleService;
      const zipBuffer = Buffer.from('zip-bytes');
      mockDocBundleService.generateBundle.mockResolvedValue({
        buffer: zipBuffer,
        fileName: 'INV-2026-0002-bundle.zip',
        format: 'ZIP',
        contentType: 'application/zip',
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.downloadDocBundle(mockUser, 'INV-2', mockRes);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="INV-2026-0002-bundle.zip"',
        'Content-Length': zipBuffer.length.toString(),
      });
      expect(mockRes.end).toHaveBeenCalledWith(zipBuffer);
    });
  });

  describe('GET /:invoice_id/pdf', () => {
    it('should download invoice PDF', async () => {
      const pdfBuffer = Buffer.from('pdf-data');
      mockInvoicePdfService.generatePdf.mockResolvedValue(pdfBuffer);
      mockInvoicingService.findOne.mockResolvedValue({
        invoiceNumber: 'INV-2026-0001',
      });

      const mockRes = { set: jest.fn(), end: jest.fn() } as any;

      await controller.downloadPdf(mockUser, 'INV-1', mockRes);

      expect(mockInvoicePdfService.generatePdf).toHaveBeenCalledWith(1, 'INV-1');
      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="INV-2026-0001.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      });
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });
  });

  describe('GET /:invoice_id/pdf/preview', () => {
    it('should preview invoice PDF inline', async () => {
      const pdfBuffer = Buffer.from('pdf-data');
      mockInvoicePdfService.generatePdf.mockResolvedValue(pdfBuffer);

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.previewPdf(mockUser, 'INV-1', mockRes);

      expect(mockRes.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Content-Length': pdfBuffer.length.toString(),
      });
      expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should return 500 when PDF generation fails', async () => {
      mockInvoicePdfService.generatePdf.mockRejectedValue(new Error('Template error'));

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.previewPdf(mockUser, 'INV-1', mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'PDF generation failed',
        error: 'Template error',
      });
    });
  });
});
