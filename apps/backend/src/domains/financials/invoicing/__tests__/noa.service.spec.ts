import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Readable } from 'stream';
import { NoaService } from '../services/noa.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { createMockPrisma } from '../../../../test/mocks';

describe('NoaService', () => {
  let service: NoaService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let events: { emit: jest.Mock };

  const tenantId = 1;

  beforeEach(async () => {
    prisma = createMockPrisma();
    events = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoaService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();

    service = module.get<NoaService>(NoaService);
  });

  // ─── listNoaRecords ──────────────────────────────────────────

  describe('listNoaRecords', () => {
    it('should list all NOA records for tenant', async () => {
      const records = [
        {
          id: 1,
          noaId: 'noa_abc',
          customerId: 1,
          factoringCompanyId: 1,
          status: 'NOT_SENT',
        },
      ];
      prisma.noaRecord.findMany.mockResolvedValue(records);

      const result = await service.listNoaRecords(tenantId);

      expect(prisma.noaRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId },
          include: expect.any(Object),
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual(records);
    });

    it('should filter by customerId when provided', async () => {
      prisma.noaRecord.findMany.mockResolvedValue([]);

      await service.listNoaRecords(tenantId, 42);

      expect(prisma.noaRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId, customerId: 42 },
        }),
      );
    });
  });

  // ─── createNoaRecord ──────────────────────────────────────────

  describe('createNoaRecord', () => {
    const data = { customerId: 1, factoringCompanyId: 2, notes: 'Test NOA' };

    it('should create NOA record when customer and factor exist', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 1, tenantId });
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 2, tenantId });
      prisma.noaRecord.findFirst.mockResolvedValue(null);
      prisma.noaRecord.create.mockResolvedValue({
        id: 1,
        noaId: 'noa_abc',
        ...data,
        status: 'NOT_SENT',
      });

      const result = await service.createNoaRecord(tenantId, data);

      expect(prisma.noaRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 1,
            factoringCompanyId: 2,
            notes: 'Test NOA',
            tenantId,
          }),
        }),
      );
      expect(result.noaId).toBe('noa_abc');
    });

    it('should throw NotFoundException when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.createNoaRecord(tenantId, data)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when factoring company not found', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 1, tenantId });
      prisma.factoringCompany.findFirst.mockResolvedValue(null);

      await expect(service.createNoaRecord(tenantId, data)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when duplicate exists', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 1, tenantId });
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 2, tenantId });
      prisma.noaRecord.findFirst.mockResolvedValue({ id: 99 });

      await expect(service.createNoaRecord(tenantId, data)).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateNoaStatus ──────────────────────────────────────────

  describe('updateNoaStatus', () => {
    it('should set sentAt when status is SENT', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue({
        id: 1,
        noaId: 'noa_abc',
        status: 'NOT_SENT',
      });
      prisma.noaRecord.update.mockResolvedValue({ id: 1, status: 'SENT' });

      await service.updateNoaStatus(tenantId, 'noa_abc', { status: 'SENT' });

      expect(prisma.noaRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SENT',
            sentAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should set acknowledgedAt when status is ACKNOWLEDGED', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue({
        id: 1,
        noaId: 'noa_abc',
        status: 'SENT',
      });
      prisma.noaRecord.update.mockResolvedValue({
        id: 1,
        status: 'ACKNOWLEDGED',
      });

      await service.updateNoaStatus(tenantId, 'noa_abc', {
        status: 'ACKNOWLEDGED',
      });

      expect(prisma.noaRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACKNOWLEDGED',
            acknowledgedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should set rejectedAt and rejectionReason when status is REJECTED', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue({
        id: 1,
        noaId: 'noa_abc',
        status: 'SENT',
      });
      prisma.noaRecord.update.mockResolvedValue({ id: 1, status: 'REJECTED' });

      await service.updateNoaStatus(tenantId, 'noa_abc', {
        status: 'REJECTED',
        rejectionReason: 'Invalid details',
      });

      expect(prisma.noaRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
            rejectedAt: expect.any(Date),
            rejectionReason: 'Invalid details',
          }),
        }),
      );
    });

    it('should throw NotFoundException when NOA not found', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue(null);

      await expect(service.updateNoaStatus(tenantId, 'noa_missing', { status: 'SENT' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── checkNoaForInvoice ──────────────────────────────────────────

  describe('checkNoaForInvoice', () => {
    it('should return NOA record when it exists', async () => {
      const noa = { id: 1, status: 'ACKNOWLEDGED' };
      prisma.noaRecord.findFirst.mockResolvedValue(noa);

      const result = await service.checkNoaForInvoice(tenantId, 1, 2);

      expect(result).toEqual(noa);
    });

    it('should return null when no NOA exists', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue(null);

      const result = await service.checkNoaForInvoice(tenantId, 1, 2);

      expect(result).toBeNull();
    });
  });

  // ─── deleteNoaRecord ──────────────────────────────────────────

  describe('deleteNoaRecord', () => {
    it('should delete NOA record', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue({ id: 1, noaId: 'noa_abc' });
      prisma.noaRecord.delete.mockResolvedValue({});

      const result = await service.deleteNoaRecord(tenantId, 'noa_abc');

      expect(prisma.noaRecord.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException when NOA not found', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue(null);

      await expect(service.deleteNoaRecord(tenantId, 'noa_missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── upsertForFactoredInvoice ──────────────────────────────────

  describe('upsertForFactoredInvoice', () => {
    it('creates NOT_SENT record + emits noa.created when one does not exist', async () => {
      prisma.noaRecord.findFirst.mockResolvedValueOnce(null);
      prisma.customer.findFirst.mockResolvedValue({ id: 1, tenantId });
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 5, tenantId });
      prisma.noaRecord.create.mockResolvedValue({
        id: 10,
        noaId: 'noa_new',
        customerId: 1,
        factoringCompanyId: 5,
        status: 'NOT_SENT',
        tenantId,
      });

      const result = await service.upsertForFactoredInvoice(tenantId, 1, 5);

      expect(result.created).toBe(true);
      expect(result.noaRecord.noaId).toBe('noa_new');
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.NOA_CREATED,
        tenantId,
        expect.objectContaining({ entityId: 'noa_new', customerId: 1, factoringCompanyId: 5 }),
      );
    });

    it('returns existing record + does NOT emit when one exists', async () => {
      prisma.noaRecord.findFirst.mockResolvedValueOnce({
        id: 99,
        noaId: 'noa_existing',
        customerId: 1,
        factoringCompanyId: 5,
        status: 'ACKNOWLEDGED',
      });

      const result = await service.upsertForFactoredInvoice(tenantId, 1, 5);

      expect(result.created).toBe(false);
      expect(result.noaRecord.noaId).toBe('noa_existing');
      expect(events.emit).not.toHaveBeenCalled();
      expect(prisma.noaRecord.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when customer not in tenant', async () => {
      prisma.noaRecord.findFirst.mockResolvedValueOnce(null);
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.upsertForFactoredInvoice(tenantId, 1, 5)).rejects.toThrow(NotFoundException);
    });

    it('handles concurrent insert race (P2002) by returning the winner', async () => {
      prisma.noaRecord.findFirst
        .mockResolvedValueOnce(null) // initial check
        .mockResolvedValueOnce({ id: 11, noaId: 'noa_race_winner', customerId: 1, factoringCompanyId: 5 }); // post-conflict refetch
      prisma.customer.findFirst.mockResolvedValue({ id: 1, tenantId });
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 5, tenantId });
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      prisma.noaRecord.create.mockRejectedValue(p2002);

      const result = await service.upsertForFactoredInvoice(tenantId, 1, 5);

      expect(result.created).toBe(false);
      expect(result.noaRecord.noaId).toBe('noa_race_winner');
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  // ─── bulkCreateForFactorChange ─────────────────────────────────

  describe('bulkCreateForFactorChange', () => {
    it('creates a NOT_SENT NoaRecord per distinct customer with recent FACTORED invoices', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 7, tenantId });
      prisma.invoice.findMany.mockResolvedValue([{ customerId: 1 }, { customerId: 2 }, { customerId: 3 }]);
      // For each customer: no existing NoaRecord → create it
      prisma.noaRecord.findFirst.mockResolvedValue(null);
      prisma.customer.findFirst.mockImplementation(async (args: { where: { id: number } }) => ({
        id: args.where.id,
        tenantId,
      }));
      prisma.noaRecord.create.mockImplementation(async ({ data }: { data: { customerId: number } }) => ({
        id: 100 + data.customerId,
        noaId: `noa_${data.customerId}`,
        ...data,
      }));

      const result = await service.bulkCreateForFactorChange(tenantId, 7);

      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.customerIds).toEqual([1, 2, 3]);
      expect(events.emit).toHaveBeenCalledTimes(3);
    });

    it('skips customers that already have a NoaRecord for the new factor', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 7, tenantId });
      prisma.invoice.findMany.mockResolvedValue([{ customerId: 1 }, { customerId: 2 }]);
      // Customer 1 already has a record, customer 2 does not.
      prisma.noaRecord.findFirst
        .mockResolvedValueOnce({ id: 50, noaId: 'noa_existing_1', customerId: 1, factoringCompanyId: 7 })
        .mockResolvedValueOnce(null);
      prisma.customer.findFirst.mockResolvedValue({ id: 2, tenantId });
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 7, tenantId });
      prisma.noaRecord.create.mockResolvedValue({
        id: 102,
        noaId: 'noa_2',
        customerId: 2,
        factoringCompanyId: 7,
      });

      const result = await service.bulkCreateForFactorChange(tenantId, 7);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('throws NotFoundException when factor not in tenant', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue(null);

      await expect(service.bulkCreateForFactorChange(tenantId, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listNoaInbox ──────────────────────────────────────────────

  describe('listNoaInbox', () => {
    const fixtureRow = {
      id: 1,
      noaId: 'noa_1',
      customerId: 10,
      factoringCompanyId: 20,
      status: 'SENT',
      sentAt: new Date('2026-04-15'),
      acknowledgedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      createdAt: new Date('2026-04-10'),
      updatedAt: new Date('2026-04-15'),
      customer: { id: 10, companyName: 'CH Robinson', customerId: 'cust_1' },
      factoringCompany: { id: 20, companyId: 'fc_1', companyName: 'OTR Solutions' },
    };

    it('returns paginated rows with computed ageDays + total count', async () => {
      prisma.noaRecord.findMany.mockResolvedValue([fixtureRow]);
      prisma.noaRecord.count.mockResolvedValue(7);

      const result = await service.listNoaInbox(tenantId, { limit: 25, offset: 0 });

      expect(result.total).toBe(7);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        noaId: 'noa_1',
        customerName: 'CH Robinson',
        factoringCompanyName: 'OTR Solutions',
        status: 'SENT',
      });
      expect(result.items[0].ageDays).toBeGreaterThanOrEqual(0);
      expect(prisma.noaRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 0 }));
    });

    it('pending_gt_14 filter narrows to SENT rows older than 14 days by sentAt', async () => {
      prisma.noaRecord.findMany.mockResolvedValue([]);
      prisma.noaRecord.count.mockResolvedValue(0);

      await service.listNoaInbox(tenantId, { ageBucket: 'pending_gt_14' });

      expect(prisma.noaRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'SENT',
            sentAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('rejected filter narrows to REJECTED rows', async () => {
      prisma.noaRecord.findMany.mockResolvedValue([]);
      prisma.noaRecord.count.mockResolvedValue(0);

      await service.listNoaInbox(tenantId, { ageBucket: 'rejected' });

      expect(prisma.noaRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'REJECTED' }),
        }),
      );
    });
  });

  // ─── sendNoaEmail ──────────────────────────────────────────────

  describe('sendNoaEmail', () => {
    const baseNoa = {
      id: 1,
      noaId: 'noa_1',
      tenantId,
      status: 'NOT_SENT',
      customerId: 10,
      factoringCompanyId: 20,
      customer: {
        id: 10,
        companyName: 'CH Robinson',
        billingEmail: 'billing@ch.com',
        contacts: [{ email: 'primary@ch.com', isPrimary: true, status: 'ACTIVE' }],
      },
      factoringCompany: {
        id: 20,
        companyName: 'OTR Solutions',
        remittanceAddress: '123 Main St',
        remittanceCity: 'Atlanta',
        remittanceState: 'GA',
        remittanceZip: '30301',
      },
    };

    let resendSendSpy: jest.Mock;

    beforeEach(() => {
      resendSendSpy = jest.fn().mockResolvedValue({ id: 'msg-1' });
      // Inject a fake Resend client + a stubbed pdf printer so the test path
      // doesn't load pdfmake/Resend for real.
      (service as unknown as { resendClient: unknown }).resendClient = {
        emails: { send: resendSendSpy },
      };
      (service as unknown as { pdfPrinter: unknown }).pdfPrinter = {
        createPdfKitDocument: () => {
          const stream = new Readable({ read() {} });
          process.nextTick(() => {
            stream.emit('data', Buffer.from('fake-pdf'));
            stream.emit('end');
          });
          (stream as unknown as { end: () => void }).end = () => {};
          return stream;
        },
      };

      // Default: updateNoaStatus call inside sendNoaEmail finds the NOA + transitions.
      prisma.noaRecord.update.mockImplementation(async ({ data }: any) => ({
        id: 1,
        noaId: 'noa_1',
        status: data.status,
      }));
    });

    it('sends to primary contact email + transitions NOT_SENT → SENT + emits noa.sent', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue(baseNoa);
      prisma.tenant.findUnique.mockResolvedValue({ companyName: 'Acme Carriers' });

      const result = await service.sendNoaEmail(tenantId, 'noa_1');

      expect(result).toEqual({ sent: true, to: 'primary@ch.com' });
      expect(resendSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'primary@ch.com',
          subject: expect.stringContaining('Notice of Assignment'),
          attachments: [expect.objectContaining({ filename: expect.stringContaining('NOA-OTR') })],
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.NOA_SENT,
        tenantId,
        expect.objectContaining({ entityId: 'noa_1' }),
      );
    });

    it('falls back to billingEmail when no primary contact', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue({
        ...baseNoa,
        customer: { ...baseNoa.customer, contacts: [] },
      });
      prisma.tenant.findUnique.mockResolvedValue({ companyName: 'Acme' });

      const result = await service.sendNoaEmail(tenantId, 'noa_1');

      expect(result.to).toBe('billing@ch.com');
    });

    it('throws BadRequestException when neither primary contact nor billingEmail is set', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue({
        ...baseNoa,
        customer: { ...baseNoa.customer, contacts: [], billingEmail: null },
      });

      await expect(service.sendNoaEmail(tenantId, 'noa_1')).rejects.toThrow(BadRequestException);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when NOA is already ACKNOWLEDGED', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue({ ...baseNoa, status: 'ACKNOWLEDGED' });

      await expect(service.sendNoaEmail(tenantId, 'noa_1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when NOA does not exist', async () => {
      prisma.noaRecord.findFirst.mockResolvedValue(null);

      await expect(service.sendNoaEmail(tenantId, 'noa_missing')).rejects.toThrow(NotFoundException);
    });
  });
});
