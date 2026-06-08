import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomerContactsService } from '../customer-contacts.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks';
import { makeCustomer } from '../../../../../test/factories';

describe('CustomerContactsService', () => {
  let service: CustomerContactsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const mockContact = {
    id: 1,
    contactId: 'ccon-001',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@acme.com',
    phone: '555-0001',
    role: 'PRIMARY',
    isPrimary: true,
    title: 'Logistics Manager',
    notes: null,
    status: 'ACTIVE',
    customerId: 1,
    tenantId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerContactsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CustomerContactsService>(CustomerContactsService);
  });

  // ─── findAll ─────────────────────────────────────────────

  describe('findAll', () => {
    it('should return active contacts for a customer', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());
      prisma.customerContact.findMany.mockResolvedValue([mockContact]);

      const result = await service.findAll('cust-test-001', 1);

      expect(result).toHaveLength(1);
      expect(result[0].contactId).toBe('ccon-001');
    });

    it('should throw NotFoundException when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.findAll('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────

  describe('create', () => {
    it('should create a contact and make it primary if no existing contacts', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());
      prisma.customerContact.count.mockResolvedValue(0);
      prisma.customerContact.updateMany.mockResolvedValue({ count: 0 });
      prisma.customerContact.create.mockResolvedValue(mockContact);

      const result = await service.create('cust-test-001', 1, {
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'PRIMARY',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.contactId).toBe('ccon-001');
    });

    it('should demote existing primary when new contact is primary', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer());
      prisma.customerContact.count.mockResolvedValue(1);
      prisma.customerContact.updateMany.mockResolvedValue({ count: 1 });
      prisma.customerContact.create.mockResolvedValue(mockContact);

      await service.create('cust-test-001', 1, {
        firstName: 'New',
        lastName: 'Primary',
        role: 'PRIMARY',
        isPrimary: true,
      });

      // Demote existing primaries
      expect(prisma.customerContact.updateMany).toHaveBeenCalledWith({
        where: { customerId: 1, isPrimary: true },
        data: { isPrimary: false },
      });
    });

    it('should throw NotFoundException when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.create('nonexistent', 1, {
          firstName: 'X',
          lastName: 'Y',
          role: 'PRIMARY',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update contact fields', async () => {
      prisma.customerContact.findFirst.mockResolvedValue(mockContact);
      prisma.customerContact.updateMany.mockResolvedValue({ count: 0 });
      prisma.customerContact.update.mockResolvedValue({
        ...mockContact,
        firstName: 'Updated',
      });

      const result = await service.update('ccon-001', 1, {
        firstName: 'Updated',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.firstName).toBe('Updated');
    });

    it('should demote other primaries when promoting to primary', async () => {
      prisma.customerContact.findFirst.mockResolvedValue(mockContact);
      prisma.customerContact.updateMany.mockResolvedValue({ count: 1 });
      prisma.customerContact.update.mockResolvedValue({
        ...mockContact,
        isPrimary: true,
      });

      await service.update('ccon-001', 1, { isPrimary: true });

      expect(prisma.customerContact.updateMany).toHaveBeenCalledWith({
        where: {
          customerId: mockContact.customerId,
          isPrimary: true,
          NOT: { id: mockContact.id },
        },
        data: { isPrimary: false },
      });
    });

    it('should throw NotFoundException when contact not found', async () => {
      prisma.customerContact.findFirst.mockResolvedValue(null);

      await expect(service.update('nonexistent', 1, { firstName: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('should validate customer exists when customerId provided', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.update('ccon-001', 1, { firstName: 'X' }, 'cust-bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete a contact and promote oldest remaining if was primary', async () => {
      prisma.customerContact.findFirst
        .mockResolvedValueOnce(mockContact) // existing
        .mockResolvedValueOnce({ ...mockContact, id: 2, isPrimary: false }); // oldest remaining
      prisma.customerContact.count.mockResolvedValue(1); // remaining count
      prisma.customerContact.update.mockResolvedValue({});
      prisma.customerContact.updateMany.mockResolvedValue({});

      const result = await service.remove('ccon-001', 1);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.message).toBe('Contact removed');
    });

    it('should throw BadRequestException when trying to delete the only contact', async () => {
      prisma.customerContact.findFirst.mockResolvedValue(mockContact);
      prisma.customerContact.count.mockResolvedValue(0); // no remaining

      await expect(service.remove('ccon-001', 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when contact not found', async () => {
      prisma.customerContact.findFirst.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });
  });
});
