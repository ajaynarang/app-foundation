import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FactoringContactsService } from '../factoring-contacts.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks';

describe('FactoringContactsService', () => {
  let service: FactoringContactsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [FactoringContactsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<FactoringContactsService>(FactoringContactsService);
  });

  afterEach(() => jest.clearAllMocks());

  const tenantId = 1;

  // ─── list ──────────────────────────────────────────────────

  describe('list', () => {
    it('should return active contacts for a factoring company', async () => {
      const contacts = [
        {
          id: 1,
          contactId: 'fc-abc',
          firstName: 'Jane',
          lastName: 'Doe',
          isPrimary: true,
        },
        {
          id: 2,
          contactId: 'fc-def',
          firstName: 'John',
          lastName: 'Smith',
          isPrimary: false,
        },
      ];
      prisma.factoringContact.findMany.mockResolvedValue(contacts);

      const result = await service.list(tenantId, 5);

      expect(prisma.factoringContact.findMany).toHaveBeenCalledWith({
        where: { factoringCompanyId: 5, tenantId, status: 'ACTIVE' },
        orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
      });
      expect(result).toEqual(contacts);
    });

    it('should return empty array when no contacts exist', async () => {
      prisma.factoringContact.findMany.mockResolvedValue([]);

      const result = await service.list(tenantId, 99);

      expect(result).toEqual([]);
    });
  });

  // ─── create ────────────────────────────────────────────────

  describe('create', () => {
    it('should create a new contact', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({
        id: 5,
        tenantId,
      });
      const created = {
        id: 1,
        contactId: 'fc-abc123',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@factor.com',
      };
      prisma.factoringContact.create.mockResolvedValue(created);

      const dto = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@factor.com',
      } as any;

      const result = await service.create(tenantId, 5, dto);

      expect(prisma.factoringCompany.findFirst).toHaveBeenCalledWith({
        where: { id: 5, tenantId },
      });
      expect(prisma.factoringContact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@factor.com',
          factoringCompanyId: 5,
          tenantId,
          contactId: expect.stringMatching(/^fc-/),
        }),
      });
      expect(result).toEqual(created);
    });

    it('should throw NotFoundException when factoring company not found', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue(null);

      const dto = { firstName: 'Jane', lastName: 'Doe' } as any;

      await expect(service.create(tenantId, 999, dto)).rejects.toThrow(NotFoundException);
      await expect(service.create(tenantId, 999, dto)).rejects.toThrow('Factoring company not found');
    });

    it('should unset existing primary contacts when isPrimary is true', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({
        id: 5,
        tenantId,
      });
      prisma.factoringContact.updateMany.mockResolvedValue({ count: 1 });
      prisma.factoringContact.create.mockResolvedValue({
        id: 2,
        contactId: 'fc-new',
        isPrimary: true,
      });

      const dto = {
        firstName: 'Jane',
        lastName: 'Doe',
        isPrimary: true,
      } as any;

      await service.create(tenantId, 5, dto);

      expect(prisma.factoringContact.updateMany).toHaveBeenCalledWith({
        where: { factoringCompanyId: 5, tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it('should not unset primary contacts when isPrimary is false', async () => {
      prisma.factoringCompany.findFirst.mockResolvedValue({
        id: 5,
        tenantId,
      });
      prisma.factoringContact.create.mockResolvedValue({
        id: 2,
        contactId: 'fc-new',
        isPrimary: false,
      });

      const dto = {
        firstName: 'Jane',
        lastName: 'Doe',
        isPrimary: false,
      } as any;

      await service.create(tenantId, 5, dto);

      expect(prisma.factoringContact.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── update ────────────────────────────────────────────────

  describe('update', () => {
    it('should update an existing contact', async () => {
      prisma.factoringContact.findFirst.mockResolvedValue({
        contactId: 'fc-abc',
        tenantId,
        factoringCompanyId: 5,
      });
      prisma.factoringContact.update.mockResolvedValue({
        contactId: 'fc-abc',
        email: 'new@email.com',
      });

      const dto = { email: 'new@email.com' } as any;

      const result = await service.update(tenantId, 'fc-abc', dto);

      expect(prisma.factoringContact.update).toHaveBeenCalledWith({
        where: { contactId: 'fc-abc' },
        data: dto,
      });
      expect(result.email).toBe('new@email.com');
    });

    it('should throw NotFoundException when contact not found', async () => {
      prisma.factoringContact.findFirst.mockResolvedValue(null);

      await expect(service.update(tenantId, 'fc-missing', { email: 'a@b.com' } as any)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.update(tenantId, 'fc-missing', { email: 'a@b.com' } as any)).rejects.toThrow(
        'Contact not found',
      );
    });

    it('should unset existing primary contacts when isPrimary is true', async () => {
      prisma.factoringContact.findFirst.mockResolvedValue({
        contactId: 'fc-abc',
        tenantId,
        factoringCompanyId: 5,
      });
      prisma.factoringContact.updateMany.mockResolvedValue({ count: 1 });
      prisma.factoringContact.update.mockResolvedValue({
        contactId: 'fc-abc',
        isPrimary: true,
      });

      const dto = { isPrimary: true } as any;

      await service.update(tenantId, 'fc-abc', dto);

      expect(prisma.factoringContact.updateMany).toHaveBeenCalledWith({
        where: { factoringCompanyId: 5, tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it('should not unset primary when isPrimary is not set', async () => {
      prisma.factoringContact.findFirst.mockResolvedValue({
        contactId: 'fc-abc',
        tenantId,
        factoringCompanyId: 5,
      });
      prisma.factoringContact.update.mockResolvedValue({
        contactId: 'fc-abc',
      });

      const dto = { email: 'updated@email.com' } as any;

      await service.update(tenantId, 'fc-abc', dto);

      expect(prisma.factoringContact.updateMany).not.toHaveBeenCalled();
    });
  });

  // ─── delete ────────────────────────────────────────────────

  describe('delete', () => {
    it('should soft delete contact by setting status to INACTIVE', async () => {
      prisma.factoringContact.findFirst.mockResolvedValue({
        contactId: 'fc-abc',
        tenantId,
      });
      prisma.factoringContact.update.mockResolvedValue({
        contactId: 'fc-abc',
        status: 'INACTIVE',
      });

      const result = await service.delete(tenantId, 'fc-abc');

      expect(prisma.factoringContact.update).toHaveBeenCalledWith({
        where: { contactId: 'fc-abc' },
        data: { status: 'INACTIVE' },
      });
      expect(result.status).toBe('INACTIVE');
    });

    it('should throw NotFoundException when contact not found', async () => {
      prisma.factoringContact.findFirst.mockResolvedValue(null);

      await expect(service.delete(tenantId, 'fc-missing')).rejects.toThrow(NotFoundException);
      await expect(service.delete(tenantId, 'fc-missing')).rejects.toThrow('Contact not found');
    });
  });
});
