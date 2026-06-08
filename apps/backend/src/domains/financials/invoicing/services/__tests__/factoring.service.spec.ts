import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FactoringService } from '../factoring.service';
import { NoaService } from '../noa.service';
import { InvoiceEmailService } from '../invoice-email.service';
import { DocBundleService } from '../doc-bundle.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../../infrastructure/database/counter.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { createMockPrisma } from '../../../../../test/mocks';
import { makeInvoice } from '../../../../../test/factories';

describe('FactoringService', () => {
  let service: FactoringService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FactoringService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NoaService,
          useValue: { checkNoaForInvoice: jest.fn() },
        },
        {
          provide: InvoiceEmailService,
          useValue: {
            sendToFactor: jest.fn().mockResolvedValue({ sent: true }),
          },
        },
        {
          provide: DocBundleService,
          useValue: {
            validateBundleReady: jest.fn().mockResolvedValue({ ready: true, missing: [] }),
          },
        },
        {
          provide: CounterService,
          useValue: { nextValue: jest.fn().mockResolvedValue(1) },
        },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<FactoringService>(FactoringService);
  });

  const tenantId = 1;

  // ─── listCompanies ──────────────────────────────────────────

  describe('listCompanies', () => {
    it('should return factoring companies for tenant', async () => {
      const companies = [
        { id: 1, companyName: 'Factor Co A', tenantId },
        { id: 2, companyName: 'Factor Co B', tenantId },
      ];
      prisma.factoringCompany.findMany.mockResolvedValue(companies);

      const result = await service.listCompanies(tenantId);

      expect(result).toHaveLength(2);
      expect(prisma.factoringCompany.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId } }));
    });
  });

  // ─── createCompany ──────────────────────────────────────────

  describe('createCompany', () => {
    it('should create a factoring company', async () => {
      prisma.factoringCompany.create.mockResolvedValue({
        id: 1,
        companyName: 'New Factor',
      });

      const result = await service.createCompany(tenantId, {
        companyName: 'New Factor',
      });

      expect(result.companyName).toBe('New Factor');
      expect(prisma.factoringCompany.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyName: 'New Factor',
            tenantId,
          }),
        }),
      );
    });

    it('does not touch tenant default when creating a company (now lives on Tenant)', async () => {
      prisma.factoringCompany.create.mockResolvedValue({ id: 2, companyName: 'X' });

      await service.createCompany(tenantId, { companyName: 'X' });

      expect(prisma.factoringCompany.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── updateCompany ──────────────────────────────────────────

  describe('updateCompany', () => {
    it('should update company fields', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({
        id: 1,
        companyId: 'fc-1',
      });
      prisma.factoringCompany.update.mockResolvedValue({
        id: 1,
        companyName: 'Updated',
      });

      const result = await service.updateCompany(tenantId, 'fc-1', {
        companyName: 'Updated',
      });

      expect(result.companyName).toBe('Updated');
    });

    it('should throw NotFoundException when company not found', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue(null);
      await expect(service.updateCompany(tenantId, 'missing', { companyName: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('does not touch tenant default when updating (now lives on Tenant)', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({ id: 1, companyId: 'fc-1' });
      prisma.factoringCompany.update.mockResolvedValue({ id: 1, companyName: 'X' });

      await service.updateCompany(tenantId, 'fc-1', { companyName: 'X' });

      expect(prisma.factoringCompany.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── deleteCompany ──────────────────────────────────────────

  describe('deleteCompany', () => {
    it('should delete a factoring company', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({
        id: 1,
        companyId: 'fc-1',
      });
      prisma.factoringCompany.delete.mockResolvedValue({});

      const result = await service.deleteCompany(tenantId, 'fc-1');

      expect(result.deleted).toBe(true);
      expect(prisma.factoringCompany.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException when company not found', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue(null);
      await expect(service.deleteCompany(tenantId, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── factorInvoice / batchFactor: DELETED in Phase 4A ──────────────────
  // Single submit flow now lives in submitToFactor; the legacy methods + their
  // controller endpoints + the frontend dialog/api/hooks were removed in the
  // same PR. See PR description.
});
