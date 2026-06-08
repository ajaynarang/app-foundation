import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CustomersService } from '../customers.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { EmailService } from '../../../../../infrastructure/notification/services/email.service';
import { CustomFieldValidatorService } from '../../../custom-fields/custom-field-validator.service';
import { createMockPrisma, createMockCache } from '../../../../../test/mocks';
import { makeCustomer } from '../../../../../test/factories';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;
  let emailService: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = createMockCache();
    emailService = {
      sendUserInvitation: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: SallyCacheService, useValue: cache },
        { provide: EmailService, useValue: emailService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') },
        },
        {
          provide: CustomFieldValidatorService,
          useValue: {
            validate: jest.fn().mockResolvedValue({ values: {}, warnings: [] }),
            getDefinitions: jest.fn().mockResolvedValue([]),
            invalidateCache: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), emitAsync: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  // ─── create ──────────────────────────────────────────────

  describe('create', () => {
    it('should create a customer and auto-create primary contact when contact info provided', async () => {
      const created = makeCustomer();
      prisma.customer.create.mockResolvedValue(created);
      prisma.customerContact.create.mockResolvedValue({});

      const result = await service.create({
        tenantId: 1,
        companyName: 'Acme Shipping Inc',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.companyName).toBe('Acme Shipping Inc');
      expect(cache.del).toHaveBeenCalled(); // invalidates cache
    });

    it('should create customer without inline contact fields', async () => {
      const created = makeCustomer();
      prisma.customer.create.mockResolvedValue(created);

      await service.create({
        tenantId: 1,
        companyName: 'No Contact LLC',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('persists defaultBillingPath and defaultFactoringCompanyId for non-CARRIER types', async () => {
      const created = makeCustomer();
      prisma.customer.create.mockResolvedValue(created);

      await service.create({
        tenantId: 1,
        companyName: 'CH Robinson',
        customerType: 'BROKER',
        defaultBillingPath: 'FACTORED',
        defaultFactoringCompanyId: 5,
      });

      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerType: 'BROKER',
            defaultBillingPath: 'FACTORED',
            defaultFactoringCompanyId: 5,
          }),
        }),
      );
    });

    it('rejects factoring overrides on CARRIER customers', async () => {
      await expect(
        service.create({
          tenantId: 1,
          companyName: 'ABC Carriers',
          customerType: 'CARRIER',
          defaultFactoringCompanyId: 5,
        }),
      ).rejects.toThrow(/cannot have factoring overrides/);
    });

    it('allows creating a CARRIER without any factoring fields', async () => {
      const created = makeCustomer({ customerType: 'CARRIER' });
      prisma.customer.create.mockResolvedValue(created);

      await service.create({
        tenantId: 1,
        companyName: 'ABC Carriers',
        customerType: 'CARRIER',
      });

      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerType: 'CARRIER', defaultFactoringCompanyId: null }),
        }),
      );
    });
  });

  // ─── findAll ─────────────────────────────────────────────

  describe('findAll', () => {
    it('should return active customers by default (filtering out INACTIVE)', async () => {
      const customers = [
        {
          ...makeCustomer(),
          status: 'ACTIVE',
          users: [],
          invitations: [],
          contacts: [],
        },
        {
          ...makeCustomer({ id: 2, status: 'INACTIVE' }),
          users: [],
          invitations: [],
          contacts: [],
        },
      ];
      // cache.getOrSet calls the factory
      cache.getOrSet.mockImplementation(async (_key: string, factory: () => any) => {
        const result = await factory();
        return result;
      });
      prisma.customer.findMany.mockResolvedValue(customers);

      const result = await service.findAll(1);

      // Should filter out INACTIVE
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('ACTIVE');
    });

    it('should include inactive customers when includeInactive is true', async () => {
      const customers = [
        {
          ...makeCustomer(),
          status: 'ACTIVE',
          users: [],
          invitations: [],
          contacts: [],
        },
        {
          ...makeCustomer({ id: 2, status: 'INACTIVE' }),
          users: [],
          invitations: [],
          contacts: [],
        },
      ];
      cache.getOrSet.mockImplementation(async (_key: string, factory: () => any) => {
        const result = await factory();
        return result;
      });
      prisma.customer.findMany.mockResolvedValue(customers);

      const result = await service.findAll(1, true);

      expect(result).toHaveLength(2);
    });
  });

  // ─── findOne ─────────────────────────────────────────────

  describe('findOne', () => {
    it('should return customer with contacts and access info', async () => {
      const customer = {
        ...makeCustomer(),
        users: [{ userId: 'u-1', isActive: true }],
        invitations: [],
        contacts: [],
      };
      prisma.customer.findFirst.mockResolvedValue(customer);

      const result = await service.findOne('cust-test-001', 1);

      expect(result.customerId).toBe('cust-test-001');
      expect(result.portalAccessStatus).toBe('ACTIVE');
    });

    it('should return INVITED portal access status when there is a pending invitation', async () => {
      const customer = {
        ...makeCustomer(),
        users: [],
        invitations: [{ invitationId: 'inv-1', email: 'x@y.com', status: 'PENDING' }],
        contacts: [],
      };
      prisma.customer.findFirst.mockResolvedValue(customer);

      const result = await service.findOne('cust-test-001', 1);

      expect(result.portalAccessStatus).toBe('INVITED');
    });

    it('should return NO_ACCESS when no users and no invitations', async () => {
      const customer = {
        ...makeCustomer(),
        users: [],
        invitations: [],
        contacts: [],
      };
      prisma.customer.findFirst.mockResolvedValue(customer);

      const result = await service.findOne('cust-test-001', 1);

      expect(result.portalAccessStatus).toBe('NO_ACCESS');
    });

    it('should throw NotFoundException when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update allowed fields', async () => {
      const existing = makeCustomer();
      prisma.customer.findFirst.mockResolvedValue(existing);
      prisma.customer.update.mockResolvedValue({
        ...existing,
        companyName: 'New Name',
      });

      const result = await service.update('cust-test-001', { companyName: 'New Name' }, 1);

      expect(result.companyName).toBe('New Name');
      expect(cache.del).toHaveBeenCalled();
    });

    it('should throw BadRequestException when setting status to INACTIVE directly', async () => {
      await expect(service.update('cust-test-001', { status: 'INACTIVE' }, 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.update('nonexistent', { companyName: 'X' }, 1)).rejects.toThrow(NotFoundException);
    });

    it('should update defaultBillingPath and defaultFactoringCompanyId', async () => {
      const existing = makeCustomer();
      prisma.customer.findFirst.mockResolvedValue(existing);
      prisma.customer.update.mockResolvedValue({
        ...existing,
        defaultBillingPath: 'FACTORED',
        defaultFactoringCompanyId: 42,
      });

      const result = await service.update(
        'cust-test-001',
        { defaultBillingPath: 'FACTORED', defaultFactoringCompanyId: 42 },
        1,
      );

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            defaultBillingPath: 'FACTORED',
            defaultFactoringCompanyId: 42,
          }),
        }),
      );
      expect(result.defaultBillingPath).toBe('FACTORED');
      expect(result.defaultFactoringCompanyId).toBe(42);
    });

    it('should clear defaultBillingPath when set to null', async () => {
      const existing = makeCustomer({ defaultBillingPath: 'DIRECT' });
      prisma.customer.findFirst.mockResolvedValue(existing);
      prisma.customer.update.mockResolvedValue({
        ...existing,
        defaultBillingPath: null,
      });

      await service.update('cust-test-001', { defaultBillingPath: '' as any }, 1);

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            defaultBillingPath: null,
          }),
        }),
      );
    });
  });

  // ─── inviteContact ───────────────────────────────────────

  describe('inviteContact', () => {
    const inviteData = {
      email: 'contact@acme.com',
      firstName: 'Jane',
      lastName: 'Doe',
      tenantId: 1,
      invitedBy: 'USR-001',
    };

    it('should create invitation and send email', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 5 }));
      prisma.customerContact.findFirst.mockResolvedValue({
        id: 10,
        email: 'contact@acme.com',
      });
      prisma.user.findFirst.mockResolvedValue(null); // no existing user
      prisma.userInvitation.findFirst.mockResolvedValue(null); // no pending invite
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        firstName: 'Admin',
        lastName: 'User',
      });
      prisma.userInvitation.create.mockResolvedValue({
        invitationId: 'inv-001',
        email: 'contact@acme.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      prisma.tenant.findUnique.mockResolvedValue({
        companyName: 'Fleet Co',
      });

      const result = await service.inviteContact('cust-test-001', inviteData);

      expect(result.invitationId).toBe('inv-001');
      expect(result.status).toBe('PENDING');
      expect(result.inviteLink).toContain('accept-invitation?token=');
      expect(emailService.sendUserInvitation).toHaveBeenCalled();
    });

    it('should throw NotFoundException when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.inviteContact('nonexistent', inviteData)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when email does not match a contact', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 5 }));
      prisma.customerContact.findFirst.mockResolvedValue(null);

      await expect(service.inviteContact('cust-test-001', inviteData)).rejects.toThrow(
        'must match an existing contact',
      );
    });

    it('should throw ConflictException when user already exists', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 5 }));
      prisma.customerContact.findFirst.mockResolvedValue({ id: 10 });
      prisma.user.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.inviteContact('cust-test-001', inviteData)).rejects.toThrow('already exists');
    });

    it('should throw ConflictException when invitation already pending', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 5 }));
      prisma.customerContact.findFirst.mockResolvedValue({ id: 10 });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.userInvitation.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.inviteContact('cust-test-001', inviteData)).rejects.toThrow('Invitation already sent');
    });

    it('should throw NotFoundException when inviting user not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 5 }));
      prisma.customerContact.findFirst.mockResolvedValue({ id: 10 });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.userInvitation.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.inviteContact('cust-test-001', inviteData)).rejects.toThrow('Inviting user not found');
    });

    it('should not throw when email sending fails', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 5 }));
      prisma.customerContact.findFirst.mockResolvedValue({ id: 10 });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.userInvitation.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        firstName: 'Admin',
        lastName: 'User',
      });
      prisma.userInvitation.create.mockResolvedValue({
        invitationId: 'inv-002',
        email: 'contact@acme.com',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      prisma.tenant.findUnique.mockResolvedValue({ companyName: 'Fleet Co' });
      emailService.sendUserInvitation.mockRejectedValue(new Error('SMTP down'));

      // Should not throw despite email failure
      const result = await service.inviteContact('cust-test-001', inviteData);
      expect(result.invitationId).toBe('inv-002');
    });
  });

  // ─── deactivate ──────────────────────────────────────────

  describe('deactivate', () => {
    it('should deactivate customer with no active loads', async () => {
      const customer = makeCustomer({ id: 1, status: 'ACTIVE' });
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.load.findMany.mockResolvedValue([]);
      prisma.customer.update.mockResolvedValue({
        ...customer,
        status: 'INACTIVE',
        deactivatedAt: new Date(),
        contacts: [],
      });

      const result = await service.deactivate('cust-test-001', 1, 100, 'No longer active');

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'INACTIVE',
            deactivationReason: 'No longer active',
          }),
        }),
      );
      expect(result.status).toBe('INACTIVE');
    });

    it('should throw BadRequestException if already inactive', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ status: 'INACTIVE' }));

      await expect(service.deactivate('cust-test-001', 1, 100, 'reason')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if customer has active loads', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ id: 1, status: 'ACTIVE' }));
      prisma.load.findMany.mockResolvedValue([{ loadNumber: 'ld-1', status: 'IN_TRANSIT' }]);

      await expect(service.deactivate('cust-test-001', 1, 100, 'reason')).rejects.toThrow(ConflictException);
    });
  });

  // ─── reactivate ──────────────────────────────────────────

  describe('reactivate', () => {
    it('should reactivate an inactive customer', async () => {
      const customer = makeCustomer({ id: 1, status: 'INACTIVE' });
      prisma.customer.findFirst.mockResolvedValue(customer);
      prisma.customer.update.mockResolvedValue({
        ...customer,
        status: 'ACTIVE',
        reactivatedAt: new Date(),
        contacts: [],
      });

      const result = await service.reactivate('cust-test-001', 1, 100);

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            deactivatedAt: null,
            deactivatedBy: null,
            deactivationReason: null,
          }),
        }),
      );
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw BadRequestException if customer is not inactive', async () => {
      prisma.customer.findFirst.mockResolvedValue(makeCustomer({ status: 'ACTIVE' }));

      await expect(service.reactivate('cust-test-001', 1, 100)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(service.reactivate('nonexistent', 1, 100)).rejects.toThrow(NotFoundException);
    });
  });
});
