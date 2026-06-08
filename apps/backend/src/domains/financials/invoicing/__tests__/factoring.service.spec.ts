import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FactoringService } from '../services/factoring.service';
import { NoaService } from '../services/noa.service';
import { InvoiceEmailService } from '../services/invoice-email.service';
import { DocBundleService } from '../services/doc-bundle.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../infrastructure/database/counter.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { createMockPrisma } from '../../../../test/mocks';
import { makeInvoice, makeCustomer } from '../../../../test/factories';

describe('FactoringService', () => {
  let service: FactoringService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let noaService: Record<string, jest.Mock>;
  let emailService: Record<string, jest.Mock>;
  let docBundleService: Record<string, jest.Mock>;
  let counterService: Record<string, jest.Mock>;
  let events: Record<string, jest.Mock>;

  const tenantId = 1;

  beforeEach(async () => {
    prisma = createMockPrisma();
    noaService = {
      checkNoaForInvoice: jest.fn(),
    };
    emailService = {
      sendToFactor: jest.fn().mockResolvedValue({ sent: true }),
    };
    docBundleService = {
      validateBundleReady: jest.fn().mockResolvedValue({ ready: true, missing: [] }),
      generateBundle: jest.fn().mockResolvedValue({
        buffer: Buffer.from('merged'),
        fileName: 'INV-001-bundle.pdf',
        format: 'MERGED_PDF',
        contentType: 'application/pdf',
        bundleS3Key: 'tenants/1/invoices/INV-001/bundle-1.pdf',
        bundleSizeBytes: 4_000_000,
        missingDocs: [],
        durationMs: 200,
      }),
    };
    counterService = {
      nextValue: jest.fn().mockResolvedValue(1),
    };
    events = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FactoringService,
        { provide: PrismaService, useValue: prisma },
        { provide: NoaService, useValue: noaService },
        { provide: InvoiceEmailService, useValue: emailService },
        { provide: DocBundleService, useValue: docBundleService },
        { provide: CounterService, useValue: counterService },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();

    service = module.get<FactoringService>(FactoringService);
  });

  // ─── submitToFactor ──────────────────────────────────────────

  describe('submitToFactor', () => {
    const invoiceId = 'INV-1001';
    const companyId = 'fc_abc123';

    const baseInvoice = makeInvoice({
      invoiceNumber: invoiceId,
      status: 'SENT',
      billingPath: 'FACTORED',
      customerId: 1,
      customer: makeCustomer(),
      load: { loadNumber: 'LD-001' },
    });

    const factorCompany = {
      id: 5,
      companyId,
      companyName: 'Factor Corp',
      submissionEmail: 'submit@factor.com',
      tenantId,
    };

    it('should submit invoice to factor successfully (happy path)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({
        id: 1,
        status: 'ACKNOWLEDGED',
      });
      prisma.invoice.update.mockResolvedValue({
        ...baseInvoice,
        status: 'FACTORED',
        factoringCompanyId: 5,
        submittedToFactorAt: new Date(),
      });

      const result = await service.submitToFactor(tenantId, invoiceId, {
        factoringCompanyId: companyId,
        factoringReference: 'FR-001',
      });

      expect(result.invoice).toBeDefined();
      expect(result.noaWarning).toBeNull();
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FACTORED',
            factoringCompanyId: 5,
            factoringReference: 'FR-001',
            submittedToFactorAt: expect.any(Date),
          }),
        }),
      );
      expect(emailService.sendToFactor).toHaveBeenCalledWith(
        tenantId,
        invoiceId,
        'submit@factor.com',
        expect.objectContaining({ bundle: expect.any(Object) }),
      );
    });

    it('transitions invoice status SENT → FACTORED and emits INVOICE_UPDATED with status delta (Phase 4)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({ id: 1, status: 'ACKNOWLEDGED' });
      prisma.invoice.update.mockResolvedValue({
        ...baseInvoice,
        status: 'FACTORED',
        factoringCompanyId: 5,
        submittedToFactorAt: new Date(),
      });

      const result = await service.submitToFactor(tenantId, invoiceId, {
        factoringCompanyId: companyId,
      });

      expect(result.invoice.status).toBe('FACTORED');
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.INVOICE_UPDATED,
        tenantId,
        expect.objectContaining({
          invoiceNumber: invoiceId,
          fromStatus: 'SENT',
          toStatus: 'FACTORED',
          factoringCompanyId: companyId,
        }),
      );
    });

    it('should throw NotFoundException when invoice not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.submitToFactor(tenantId, invoiceId, {
          factoringCompanyId: companyId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when invoice status is DRAFT', async () => {
      prisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'DRAFT', billingPath: 'FACTORED' }));

      await expect(
        service.submitToFactor(tenantId, invoiceId, {
          factoringCompanyId: companyId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when billingPath is not FACTORED', async () => {
      prisma.invoice.findFirst.mockResolvedValue(makeInvoice({ status: 'SENT', billingPath: 'DIRECT' }));

      await expect(
        service.submitToFactor(tenantId, invoiceId, {
          factoringCompanyId: companyId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('NOA gate: blocks submission with BadRequestException naming the customer when no NOA exists', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue(null);

      const error: BadRequestException = await service
        .submitToFactor(tenantId, invoiceId, { factoringCompanyId: companyId })
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const msg = (error.getResponse() as { message: string }).message;
      expect(msg).toContain('NOA must be ACKNOWLEDGED');
      expect(msg).toContain((baseInvoice as any).customer.companyName);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('NOA gate: blocks when NoaRecord exists but status is SENT (not yet acknowledged)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({ id: 1, status: 'SENT' });

      await expect(service.submitToFactor(tenantId, invoiceId, { factoringCompanyId: companyId })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('NOA gate: passes when NoaRecord status is ACKNOWLEDGED (no warning surfaced)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({ id: 1, status: 'ACKNOWLEDGED' });
      prisma.invoice.update.mockResolvedValue({ ...baseInvoice, factoringCompanyId: 5 });

      const result = await service.submitToFactor(tenantId, invoiceId, {
        factoringCompanyId: companyId,
        sendEmail: false,
      });

      expect(result.noaWarning).toBeNull();
      expect(prisma.invoice.update).toHaveBeenCalled();
    });

    it('should not send email when sendEmail is false', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({
        id: 1,
        status: 'ACKNOWLEDGED',
      });
      prisma.invoice.update.mockResolvedValue(baseInvoice);

      await service.submitToFactor(tenantId, invoiceId, {
        factoringCompanyId: companyId,
        sendEmail: false,
      });

      expect(emailService.sendToFactor).not.toHaveBeenCalled();
    });

    it('does not throw when email sending fails — surfaces emailWarning instead of swallowing', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({
        id: 1,
        status: 'ACKNOWLEDGED',
      });
      prisma.invoice.update.mockResolvedValue(baseInvoice);
      emailService.sendToFactor.mockRejectedValue(new Error('SMTP down'));

      // Should not throw, but must surface the failure rather than silently
      // marking submitted with no email actually delivered.
      const result = await service.submitToFactor(tenantId, invoiceId, {
        factoringCompanyId: companyId,
      });

      expect(result.invoice).toBeDefined();
      expect(result.emailWarning).toBeTruthy();
    });

    it('should throw NotFoundException when factoring company not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(null);

      await expect(
        service.submitToFactor(tenantId, invoiceId, {
          factoringCompanyId: 'fc_nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException naming the missing docs when bundle is incomplete', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      docBundleService.validateBundleReady.mockResolvedValue({ ready: false, missing: ['POD'] });

      const error: BadRequestException = await service
        .submitToFactor(tenantId, invoiceId, { factoringCompanyId: companyId })
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error.getResponse() as { message: string }).message).toContain('POD');
      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(emailService.sendToFactor).not.toHaveBeenCalled();
    });

    it('lists multiple missing docs in the BadRequestException message', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      docBundleService.validateBundleReady.mockResolvedValue({
        ready: false,
        missing: ['BOL', 'POD'],
      });

      const error: BadRequestException = await service
        .submitToFactor(tenantId, invoiceId, { factoringCompanyId: companyId })
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      const msg = (error.getResponse() as { message: string }).message;
      expect(msg).toContain('BOL');
      expect(msg).toContain('POD');
    });

    it('generates the bundle BEFORE the invoice update (so a merge race does not leave a half-state)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({ id: 1, status: 'ACKNOWLEDGED' });

      // Simulate a race: a doc was deleted between validateBundleReady and
      // generateBundle. The bundle generation throws, and we must NOT have
      // updated the invoice row.
      docBundleService.generateBundle.mockRejectedValue(
        new BadRequestException('Bill of Lading could not be loaded — please re-upload it.'),
      );

      await expect(service.submitToFactor(tenantId, invoiceId, { factoringCompanyId: companyId })).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.invoice.update).not.toHaveBeenCalled();
      expect(emailService.sendToFactor).not.toHaveBeenCalled();
    });

    it('returns emailWarning when email send fails after a successful submit (no silent failure)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({ id: 1, status: 'ACKNOWLEDGED' });
      prisma.invoice.update.mockResolvedValue({ ...baseInvoice, factoringCompanyId: 5 });
      emailService.sendToFactor.mockRejectedValue(new Error('Resend down'));

      const result = await service.submitToFactor(tenantId, invoiceId, { factoringCompanyId: companyId });

      expect(result.invoice).toBeDefined();
      expect(result.emailWarning).toContain('email delivery failed');
      // Bundle was generated once and passed to sendToFactor (no double-merge).
      expect(docBundleService.generateBundle).toHaveBeenCalledTimes(1);
      expect(emailService.sendToFactor).toHaveBeenCalledWith(
        tenantId,
        invoiceId,
        'submit@factor.com',
        expect.objectContaining({ bundle: expect.any(Object) }),
      );
    });

    it('skips bundle generation entirely when sendEmail=false (no merge cost on save-only submit)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({ id: 1, status: 'ACKNOWLEDGED' });
      prisma.invoice.update.mockResolvedValue({ ...baseInvoice, factoringCompanyId: 5 });

      await service.submitToFactor(tenantId, invoiceId, { factoringCompanyId: companyId, sendEmail: false });

      expect(docBundleService.generateBundle).not.toHaveBeenCalled();
      expect(emailService.sendToFactor).not.toHaveBeenCalled();
    });
  });

  // ─── batchSubmitToFactor ──────────────────────────────────────────

  describe('batchSubmitToFactor', () => {
    it('should count submitted and skipped', async () => {
      // First succeeds, second fails
      const invoice1 = makeInvoice({
        invoiceNumber: 'INV-1',
        status: 'SENT',
        billingPath: 'FACTORED',
        customerId: 1,
      });
      const factorCompany = {
        id: 5,
        companyId: 'fc_abc',
        submissionEmail: null,
        tenantId,
      };

      let callCount = 0;
      prisma.invoice.findFirst.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return invoice1;
        return null; // second call fails
      });
      prisma.factoringCompany.findFirst.mockResolvedValue(factorCompany);
      noaService.checkNoaForInvoice.mockResolvedValue({
        id: 1,
        status: 'ACKNOWLEDGED',
      });
      prisma.invoice.update.mockResolvedValue(invoice1);

      const result = await service.batchSubmitToFactor(tenantId, ['inv-1', 'inv-2'], { factoringCompanyId: 'fc_abc' });

      expect(result.submitted).toBe(1);
      expect(result.skipped).toBe(1);
    });
  });

  // ─── createCompany ──────────────────────────────────────────

  describe('createCompany', () => {
    it('should create a factoring company with new fields', async () => {
      prisma.factoringCompany.create.mockResolvedValue({
        id: 1,
        companyId: 'fc_test',
        companyName: 'Test Factor',
        submissionEmail: 'submit@test.com',
        advanceRatePct: 95,
        feeRatePct: 3,
        recourseType: 'NON_RECOURSE',
      });

      const result = await service.createCompany(tenantId, {
        companyName: 'Test Factor',
        submissionEmail: 'submit@test.com',
        advanceRatePct: 95,
        feeRatePct: 3,
        recourseType: 'NON_RECOURSE',
      });

      expect(prisma.factoringCompany.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyName: 'Test Factor',
            submissionEmail: 'submit@test.com',
            advanceRatePct: 95,
            feeRatePct: 3,
            recourseType: 'NON_RECOURSE',
            tenantId,
          }),
        }),
      );
      expect(result.companyName).toBe('Test Factor');
    });

    it('does not touch tenant default when creating a company (now lives on Tenant)', async () => {
      prisma.factoringCompany.create.mockResolvedValue({
        id: 1,
        companyId: 'fc_test',
      });

      await service.createCompany(tenantId, { companyName: 'Default Factor' });

      expect(prisma.factoringCompany.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── Phase 4 — money ledger (record*, delete, list) ─────────────────────

  describe('recordAdvance', () => {
    const invoiceId = 'INV-MONEY-001';
    const userId = 7;
    const factoredInvoice = {
      ...makeInvoice({ invoiceNumber: invoiceId, status: 'FACTORED', billingPath: 'FACTORED', totalCents: 200000 }),
      factoringCompanyId: 5,
      factoringCompanyRel: {
        id: 5,
        companyId: 'fc_abc',
        companyName: 'OTR Solutions',
        advanceRatePct: '95.00',
        feeRatePct: '3.00',
        recourseType: 'RECOURSE',
      } as any,
    };

    beforeEach(() => {
      counterService.nextValue.mockResolvedValue(1);
    });

    it('creates ADVANCE + FEE rows, populates Invoice money fields, emits both events', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(factoredInvoice).mockResolvedValueOnce({
        ...factoredInvoice,
        advanceAmountCents: 190000,
        factoringFeeCents: 6000,
        reserveAmountCents: 4000,
      });
      prisma.factoringTransaction.create
        .mockResolvedValueOnce({ id: 1, transactionId: 'FT-20260421-001', type: 'ADVANCE', amountCents: 190000 })
        .mockResolvedValueOnce({ id: 2, transactionId: 'FT-20260421-002', type: 'FEE', amountCents: 6000 });
      prisma.factoringTransaction.findMany.mockResolvedValue([
        {
          type: 'ADVANCE',
          amountCents: 190000,
          transactionDate: new Date('2026-04-21T00:00:00Z'),
        },
        {
          type: 'FEE',
          amountCents: 6000,
          transactionDate: new Date('2026-04-21T00:00:00Z'),
        },
      ]);
      prisma.invoice.findUnique.mockResolvedValue(factoredInvoice);
      prisma.invoice.update.mockResolvedValue({ ...factoredInvoice });

      const result = await service.recordAdvance(tenantId, invoiceId, userId, {
        type: 'ADVANCE',
        amountCents: 190000,
        transactionDate: '2026-04-21',
        autoRecordFee: true,
      });

      // 1. ADVANCE row created with rate snapshot + actor
      expect(prisma.factoringTransaction.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ADVANCE',
            amountCents: 190000,
            tenantId,
            createdBy: userId,
            advanceRatePctSnapshot: '95.00',
            feeRatePctSnapshot: '3.00',
          }),
        }),
      );
      // 2. FEE auto-created from rate-card (3% of 200000 = 6000)
      expect(prisma.factoringTransaction.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'FEE',
            amountCents: 6000,
            metadata: expect.objectContaining({ autoFromRateCard: true }),
          }),
        }),
      );
      // 3. Both events emitted
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.FACTORING_ADVANCE_RECORDED,
        tenantId,
        expect.objectContaining({ invoiceNumber: invoiceId, amountCents: 190000 }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.FACTORING_FEE_RECORDED,
        tenantId,
        expect.objectContaining({ amountCents: 6000, auto: true }),
      );
      expect(result.advance.transactionId).toBe('FT-20260421-001');
      expect(result.fee?.transactionId).toBe('FT-20260421-002');
    });

    it('skips auto-fee when autoRecordFee=false', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(factoredInvoice).mockResolvedValueOnce(factoredInvoice);
      prisma.factoringTransaction.create.mockResolvedValueOnce({
        id: 1,
        transactionId: 'FT-X-001',
        type: 'ADVANCE',
      });
      prisma.factoringTransaction.findMany.mockResolvedValue([]);
      prisma.invoice.findUnique.mockResolvedValue(factoredInvoice);

      await service.recordAdvance(tenantId, invoiceId, userId, {
        type: 'ADVANCE',
        amountCents: 190000,
        transactionDate: '2026-04-21',
        autoRecordFee: false,
      });

      expect(prisma.factoringTransaction.create).toHaveBeenCalledTimes(1);
      expect(events.emit).not.toHaveBeenCalledWith(SALLY_EVENTS.FACTORING_FEE_RECORDED, tenantId, expect.anything());
    });

    it('skips auto-fee when factoringCompany has null feeRatePct', async () => {
      const noFeeInvoice = {
        ...factoredInvoice,
        factoringCompanyRel: { ...factoredInvoice.factoringCompanyRel, feeRatePct: null },
      };
      prisma.invoice.findFirst.mockResolvedValueOnce(noFeeInvoice).mockResolvedValueOnce(noFeeInvoice);
      prisma.factoringTransaction.create.mockResolvedValueOnce({ id: 1, transactionId: 'FT-X', type: 'ADVANCE' });
      prisma.factoringTransaction.findMany.mockResolvedValue([]);
      prisma.invoice.findUnique.mockResolvedValue(noFeeInvoice);

      await service.recordAdvance(tenantId, invoiceId, userId, {
        type: 'ADVANCE',
        amountCents: 190000,
        transactionDate: '2026-04-21',
        autoRecordFee: true,
      });

      expect(prisma.factoringTransaction.create).toHaveBeenCalledTimes(1);
    });

    it('rejects when invoice status is not FACTORED', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...factoredInvoice, status: 'SENT' });
      await expect(
        service.recordAdvance(tenantId, invoiceId, userId, {
          type: 'ADVANCE',
          amountCents: 190000,
          transactionDate: '2026-04-21',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cross-tenant invoice (NotFoundException, no leak)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(
        service.recordAdvance(99, 'inv_other', userId, {
          type: 'ADVANCE',
          amountCents: 1,
          transactionDate: '2026-04-21',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate advance (P2002 -> ConflictException with clean message)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(factoredInvoice);
      const dupErr: any = new Error('Unique constraint failed');
      dupErr.code = 'P2002';
      Object.setPrototypeOf(dupErr, Prisma.PrismaClientKnownRequestError.prototype);
      prisma.factoringTransaction.create.mockRejectedValue(dupErr);

      await expect(
        service.recordAdvance(tenantId, invoiceId, userId, {
          type: 'ADVANCE',
          amountCents: 190000,
          transactionDate: '2026-04-21',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when invoice has no factoring company', async () => {
      prisma.invoice.findFirst.mockResolvedValue({
        ...factoredInvoice,
        factoringCompanyId: null,
        factoringCompanyRel: null,
      });
      await expect(
        service.recordAdvance(tenantId, invoiceId, userId, {
          type: 'ADVANCE',
          amountCents: 1,
          transactionDate: '2026-04-21',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordFee', () => {
    const invoiceId = 'INV-MONEY-001';
    const userId = 7;
    const factoredInvoice = {
      ...makeInvoice({ invoiceNumber: invoiceId, status: 'FACTORED', totalCents: 200000 }),
      factoringCompanyId: 5,
      factoringCompanyRel: { id: 5, companyId: 'fc_abc', feeRatePct: '3.00' } as any,
    };

    it('creates a FEE row and emits FEE event with auto:false', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(factoredInvoice).mockResolvedValueOnce(factoredInvoice);
      prisma.factoringTransaction.create.mockResolvedValueOnce({
        id: 9,
        transactionId: 'FT-FEE-001',
        type: 'FEE',
      });
      prisma.factoringTransaction.findMany.mockResolvedValue([]);
      prisma.invoice.findUnique.mockResolvedValue(factoredInvoice);

      await service.recordFee(tenantId, invoiceId, userId, {
        type: 'FEE',
        amountCents: 5000,
        transactionDate: '2026-05-01',
      });

      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.FACTORING_FEE_RECORDED,
        tenantId,
        expect.objectContaining({ amountCents: 5000, auto: false }),
      );
    });

    it('rejects when invoice status is not FACTORED or RECOURSED', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...factoredInvoice, status: 'SENT' });
      await expect(
        service.recordFee(tenantId, invoiceId, userId, {
          type: 'FEE',
          amountCents: 1,
          transactionDate: '2026-05-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordReserveRelease', () => {
    const invoiceId = 'INV-MONEY-001';
    const userId = 7;
    const factoredInvoice = {
      ...makeInvoice({ invoiceNumber: invoiceId, status: 'FACTORED', totalCents: 200000 }),
      advanceAmountCents: 190000,
      reserveAmountCents: 4000,
      factoringCompanyId: 5,
      factoringCompanyRel: { id: 5, companyId: 'fc_abc' } as any,
    };

    it('creates RESERVE_RELEASE row and transitions FACTORED → PAID', async () => {
      prisma.invoice.findFirst.mockResolvedValueOnce(factoredInvoice).mockResolvedValueOnce(factoredInvoice);
      prisma.factoringTransaction.create.mockResolvedValueOnce({
        id: 10,
        transactionId: 'FT-RR-001',
        type: 'RESERVE_RELEASE',
      });
      prisma.factoringTransaction.findMany.mockResolvedValue([]);
      prisma.invoice.findUnique.mockResolvedValue(factoredInvoice);
      prisma.invoice.update.mockResolvedValue({ ...factoredInvoice, status: 'PAID' });

      await service.recordReserveRelease(tenantId, invoiceId, userId, {
        type: 'RESERVE_RELEASE',
        amountCents: 4000,
        transactionDate: '2026-05-21',
      });

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.FACTORING_RESERVE_RELEASED,
        tenantId,
        expect.objectContaining({ amountCents: 4000 }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.INVOICE_UPDATED,
        tenantId,
        expect.objectContaining({ fromStatus: 'FACTORED', toStatus: 'PAID' }),
      );
    });

    it('rejects when no advance has been recorded yet', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...factoredInvoice, advanceAmountCents: null });
      await expect(
        service.recordReserveRelease(tenantId, invoiceId, userId, {
          type: 'RESERVE_RELEASE',
          amountCents: 4000,
          transactionDate: '2026-05-21',
        }),
      ).rejects.toThrow(/advance/i);
    });

    it('rejects when invoice is not FACTORED (e.g. already PAID or RECOURSED)', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...factoredInvoice, status: 'RECOURSED' });
      await expect(
        service.recordReserveRelease(tenantId, invoiceId, userId, {
          type: 'RESERVE_RELEASE',
          amountCents: 4000,
          transactionDate: '2026-05-21',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordChargeback', () => {
    const invoiceId = 'INV-MONEY-001';
    const userId = 7;
    const factoredInvoice = {
      ...makeInvoice({ invoiceNumber: invoiceId, status: 'FACTORED', totalCents: 200000 }),
      factoringCompanyId: 5,
      factoringCompanyRel: { id: 5, companyId: 'fc_abc' } as any,
    };

    it('creates CHARGEBACK and transitions FACTORED → RECOURSED on first chargeback', async () => {
      prisma.invoice.findFirst.mockResolvedValue(factoredInvoice);
      prisma.factoringTransaction.create.mockResolvedValue({
        id: 11,
        transactionId: 'FT-CB-001',
        type: 'CHARGEBACK',
      });
      prisma.invoice.update.mockResolvedValue({ ...factoredInvoice, status: 'RECOURSED' });

      await service.recordChargeback(tenantId, invoiceId, userId, {
        type: 'CHARGEBACK',
        amountCents: 190000,
        transactionDate: '2026-06-05',
      });

      expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'RECOURSED' } }));
      expect(events.emit).toHaveBeenCalledWith(SALLY_EVENTS.FACTORING_CHARGEBACK_RECEIVED, tenantId, expect.anything());
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.INVOICE_UPDATED,
        tenantId,
        expect.objectContaining({ fromStatus: 'FACTORED', toStatus: 'RECOURSED' }),
      );
    });

    it('does NOT re-flip status on a second chargeback (already RECOURSED)', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...factoredInvoice, status: 'RECOURSED' });
      prisma.factoringTransaction.create.mockResolvedValue({
        id: 12,
        transactionId: 'FT-CB-002',
        type: 'CHARGEBACK',
      });

      await service.recordChargeback(tenantId, invoiceId, userId, {
        type: 'CHARGEBACK',
        amountCents: 1000,
        transactionDate: '2026-06-06',
      });

      expect(prisma.invoice.update).not.toHaveBeenCalled();
      // Still emits the chargeback event (audit), just not the status-change event.
      expect(events.emit).toHaveBeenCalledWith(SALLY_EVENTS.FACTORING_CHARGEBACK_RECEIVED, tenantId, expect.anything());
      expect(events.emit).not.toHaveBeenCalledWith(
        SALLY_EVENTS.INVOICE_UPDATED,
        tenantId,
        expect.objectContaining({ toStatus: 'RECOURSED' }),
      );
    });
  });

  describe('recordChargebackReversal', () => {
    const invoiceId = 'INV-MONEY-001';
    const userId = 7;
    const recoursedInvoice = {
      ...makeInvoice({ invoiceNumber: invoiceId, status: 'RECOURSED', totalCents: 200000 }),
      factoringCompanyId: 5,
      factoringCompanyRel: { id: 5, companyId: 'fc_abc' } as any,
    };

    it('creates CHARGEBACK_REVERSAL and transitions RECOURSED → FACTORED', async () => {
      prisma.invoice.findFirst.mockResolvedValue(recoursedInvoice);
      prisma.factoringTransaction.create.mockResolvedValue({
        id: 13,
        transactionId: 'FT-CBR-001',
        type: 'CHARGEBACK_REVERSAL',
      });
      prisma.invoice.update.mockResolvedValue({ ...recoursedInvoice, status: 'FACTORED' });

      await service.recordChargebackReversal(tenantId, invoiceId, userId, {
        type: 'CHARGEBACK_REVERSAL',
        amountCents: 190000,
        transactionDate: '2026-06-15',
      });

      expect(prisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'FACTORED' } }));
      expect(events.emit).toHaveBeenCalledWith(SALLY_EVENTS.FACTORING_CHARGEBACK_REVERSED, tenantId, expect.anything());
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.INVOICE_UPDATED,
        tenantId,
        expect.objectContaining({ fromStatus: 'RECOURSED', toStatus: 'FACTORED' }),
      );
    });

    it('allows additional reversals on already-FACTORED invoice without re-flipping', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...recoursedInvoice, status: 'FACTORED' });
      prisma.factoringTransaction.create.mockResolvedValue({
        id: 14,
        transactionId: 'FT-CBR-002',
        type: 'CHARGEBACK_REVERSAL',
      });

      await service.recordChargebackReversal(tenantId, invoiceId, userId, {
        type: 'CHARGEBACK_REVERSAL',
        amountCents: 5000,
        transactionDate: '2026-06-20',
      });

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteFactoringTransaction', () => {
    const userId = 7;
    const txn = {
      id: 99,
      transactionId: 'FT-XX-001',
      tenantId,
      invoiceId: 1,
      type: 'FEE',
      amountCents: 6000,
      deletedAt: null,
    };

    it('soft-deletes the row and rebuilds invoice money cache', async () => {
      prisma.factoringTransaction.findFirst.mockResolvedValue(txn);
      prisma.factoringTransaction.findMany.mockResolvedValue([]);
      prisma.invoice.findUnique.mockResolvedValue(makeInvoice({ totalCents: 200000 }));

      const result = await service.deleteFactoringTransaction(tenantId, 'FT-XX-001', userId);

      expect(prisma.factoringTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99 },
          data: expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: userId }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.FACTORING_TRANSACTION_DELETED,
        tenantId,
        expect.objectContaining({ transactionId: 'FT-XX-001' }),
      );
      expect(result).toEqual({ deleted: true, transactionId: 'FT-XX-001' });
    });

    it('rejects cross-tenant transaction (NotFound)', async () => {
      prisma.factoringTransaction.findFirst.mockResolvedValue(null);
      await expect(service.deleteFactoringTransaction(99, 'FT-XX-001', userId)).rejects.toThrow(NotFoundException);
    });

    it('rejects already-deleted transaction', async () => {
      prisma.factoringTransaction.findFirst.mockResolvedValue({ ...txn, deletedAt: new Date() });
      await expect(service.deleteFactoringTransaction(tenantId, 'FT-XX-001', userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listFactoringTransactions', () => {
    it('returns the active ledger ordered by transaction date asc', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 1 });
      const rows = [{ id: 1, transactionId: 'FT-1', type: 'ADVANCE' }];
      prisma.factoringTransaction.findMany.mockResolvedValue(rows);

      const result = await service.listFactoringTransactions(tenantId, 'inv-1');
      expect(result).toBe(rows);
      expect(prisma.factoringTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invoiceId: 1, tenantId, deletedAt: null },
          orderBy: { transactionDate: 'asc' },
        }),
      );
    });

    it('rejects cross-tenant invoice (NotFound)', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.listFactoringTransactions(99, 'inv_other')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFactoringSummary (Phase 4C — real aggregation)', () => {
    beforeEach(() => {
      prisma.factoringTransaction.groupBy.mockResolvedValue([]);
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { reserveAmountCents: null } } as any);
      prisma.invoice.findMany.mockResolvedValue([]);
    });

    it('returns zeros when no factoring activity', async () => {
      const result = await service.getFactoringSummary(tenantId);
      expect(result).toEqual({
        totalSubmittedCents: 0,
        totalSubmittedCount: 0,
        totalFundedCents: 0,
        totalFundedCount: 0,
        totalFeeCents: 0,
        reservesOutstandingCents: 0,
        averageDaysToFund: null,
        recourseRatePct: 0,
      });
    });

    it('aggregates ADVANCE + FEE totals from the active ledger', async () => {
      prisma.factoringTransaction.groupBy.mockResolvedValue([
        { type: 'ADVANCE', _sum: { amountCents: 1_000_000 }, _count: 5 },
        { type: 'FEE', _sum: { amountCents: 30_000 }, _count: 5 },
      ] as any);
      prisma.invoice.count.mockResolvedValueOnce(7).mockResolvedValueOnce(1);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { reserveAmountCents: 200_000 } } as any);

      const result = await service.getFactoringSummary(tenantId);

      expect(result.totalFundedCents).toBe(1_000_000);
      expect(result.totalFundedCount).toBe(5);
      expect(result.totalFeeCents).toBe(30_000);
      expect(result.reservesOutstandingCents).toBe(200_000);
      expect(result.totalSubmittedCount).toBe(7);
      // recourse rate: 1 / 7 ≈ 14.28%
      expect(result.recourseRatePct).toBeCloseTo(14.28, 1);
    });

    it('computes averageDaysToFund from the last 30d funded set', async () => {
      const submitted = new Date('2026-04-15T00:00:00Z');
      const funded = new Date('2026-04-17T00:00:00Z'); // 2 days
      prisma.invoice.findMany.mockResolvedValue([
        { submittedToFactorAt: submitted, advanceReceivedAt: funded },
        { submittedToFactorAt: submitted, advanceReceivedAt: funded },
      ] as any);

      const result = await service.getFactoringSummary(tenantId);
      expect(result.averageDaysToFund).toBeCloseTo(2, 1);
    });

    it('honors optional date range on the ledger query', async () => {
      await service.getFactoringSummary(tenantId, { from: '2026-01-01', to: '2026-06-30' });
      expect(prisma.factoringTransaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            transactionDate: expect.objectContaining({
              gte: new Date('2026-01-01T00:00:00Z'),
              lte: new Date('2026-06-30T00:00:00Z'),
            }),
          }),
        }),
      );
    });
  });

  // ─── Legacy factorInvoice/batchFactor: DELETED in Phase 4A ──────────────
  // Single submit flow now lives in submitToFactor; the legacy methods + their
  // controller endpoints + the frontend dialog/api/hooks were removed in the
  // same PR. See PR description.
});
