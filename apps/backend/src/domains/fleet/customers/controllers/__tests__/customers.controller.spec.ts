import { Test, TestingModule } from '@nestjs/testing';
import { CustomersController } from '../customers.controller';
import { CustomersService } from '../../services/customers.service';
import { CustomerContactsService } from '../../services/customer-contacts.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('CustomersController', () => {
  let controller: CustomersController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'ADMIN',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
  };

  const mockCustomersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    inviteContact: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
  };

  const mockContactsService = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: CustomerContactsService, useValue: mockContactsService },
      ],
    }).compile();

    controller = module.get<CustomersController>(CustomersController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST / (create)', () => {
    it('should create customer with tenantId', async () => {
      const dto = { companyName: 'Acme Corp' } as any;
      mockCustomersService.create.mockResolvedValue({
        customerId: 'CUST-1',
        companyName: 'Acme Corp',
      });

      const result = await controller.create(mockUser, dto);
      expect(mockCustomersService.create).toHaveBeenCalledWith({
        companyName: 'Acme Corp',
        tenantId: 1,
      });
      expect(result.customerId).toBe('CUST-1');
    });
  });

  describe('GET / (list)', () => {
    it('should list customers', async () => {
      mockCustomersService.findAll.mockResolvedValue([{ customerId: 'CUST-1' }]);

      const result = await controller.list(mockUser);
      expect(mockCustomersService.findAll).toHaveBeenCalledWith(1, false);
      expect(result).toHaveLength(1);
    });

    it('should include inactive when requested', async () => {
      mockCustomersService.findAll.mockResolvedValue([]);

      await controller.list(mockUser, 'true');
      expect(mockCustomersService.findAll).toHaveBeenCalledWith(1, true);
    });
  });

  describe('GET /:customer_id (get)', () => {
    it('should return customer details', async () => {
      mockCustomersService.findOne.mockResolvedValue({
        customerId: 'CUST-1',
        companyName: 'Acme',
      });

      await controller.get(mockUser, 'CUST-1');
      expect(mockCustomersService.findOne).toHaveBeenCalledWith('CUST-1', 1);
    });
  });

  describe('PUT /:customer_id (update)', () => {
    it('should update customer', async () => {
      const dto = { companyName: 'Acme Updated' } as any;
      mockCustomersService.update.mockResolvedValue({ customerId: 'CUST-1' });

      await controller.update(mockUser, 'CUST-1', dto);
      expect(mockCustomersService.update).toHaveBeenCalledWith('CUST-1', dto, 1);
    });
  });

  describe('POST /:customer_id/invite', () => {
    it('should invite customer contact', async () => {
      mockCustomersService.inviteContact.mockResolvedValue({ invited: true });

      await controller.inviteCustomer(mockUser, 'CUST-1', {
        email: 'contact@acme.com',
        firstName: 'Jane',
        lastName: 'Smith',
      });

      expect(mockCustomersService.inviteContact).toHaveBeenCalledWith('CUST-1', {
        email: 'contact@acme.com',
        firstName: 'Jane',
        lastName: 'Smith',
        tenantId: 1,
        invitedBy: 'user-1',
      });
    });
  });

  describe('POST /:customer_id/deactivate', () => {
    it('should deactivate customer', async () => {
      mockCustomersService.deactivate.mockResolvedValue({ status: 'inactive' });

      await controller.deactivate('CUST-1', { reason: 'No activity' } as any, mockUser);
      expect(mockCustomersService.deactivate).toHaveBeenCalledWith('CUST-1', 1, 1, 'No activity');
    });
  });

  describe('POST /:customer_id/reactivate', () => {
    it('should reactivate customer', async () => {
      mockCustomersService.reactivate.mockResolvedValue({ status: 'active' });

      await controller.reactivate('CUST-1', mockUser);
      expect(mockCustomersService.reactivate).toHaveBeenCalledWith('CUST-1', 1, 1);
    });
  });

  describe('Contact endpoints', () => {
    it('GET /:customer_id/contacts should list contacts', async () => {
      mockContactsService.findAll.mockResolvedValue([{ id: 1 }]);

      await controller.listContacts(mockUser, 'CUST-1');
      expect(mockContactsService.findAll).toHaveBeenCalledWith('CUST-1', 1);
    });

    it('POST /:customer_id/contacts should create contact', async () => {
      const dto = { firstName: 'Jane', email: 'jane@acme.com' } as any;
      mockContactsService.create.mockResolvedValue({ id: 1 });

      await controller.createContact(mockUser, 'CUST-1', dto);
      expect(mockContactsService.create).toHaveBeenCalledWith('CUST-1', 1, dto);
    });

    it('PUT /:customer_id/contacts/:contact_id should update contact', async () => {
      const dto = { firstName: 'Janet' } as any;
      mockContactsService.update.mockResolvedValue({ id: 1 });

      await controller.updateContact(mockUser, 'CUST-1', 'CT-1', dto);
      expect(mockContactsService.update).toHaveBeenCalledWith('CT-1', 1, dto, 'CUST-1');
    });

    it('DELETE /:customer_id/contacts/:contact_id should remove contact', async () => {
      mockContactsService.remove.mockResolvedValue({ removed: true });

      await controller.deleteContact(mockUser, 'CUST-1', 'CT-1');
      expect(mockContactsService.remove).toHaveBeenCalledWith('CT-1', 1, 'CUST-1');
    });
  });
});
