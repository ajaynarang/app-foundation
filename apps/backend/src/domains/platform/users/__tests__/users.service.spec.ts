import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NotificationTriggersService } from '../../../operations/notifications/notification-triggers.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let notificationTriggers: any;

  const mockTenant = { id: 1, tenantId: 'tenant_abc' };
  const mockUser = {
    id: 10,
    userId: 'user_1234abcd',
    email: 'john@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'DISPATCHER',
    isActive: true,
    emailVerified: true,
    createdAt: new Date('2026-01-01'),
    lastLoginAt: new Date('2026-03-01'),
    tenant: { tenantId: 'tenant_abc', companyName: 'TestCo' },
    driver: null,
  };

  beforeEach(async () => {
    prisma = {
      tenant: { findUnique: jest.fn() },
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    notificationTriggers = {
      userJoined: jest.fn().mockResolvedValue(undefined),
      userRoleChanged: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationTriggersService,
          useValue: notificationTriggers,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getAllUsers', () => {
    it('should return users for a given tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.getAllUsers('tenant_abc');

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_abc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user_1234abcd');
      expect(result[0].email).toBe('john@example.com');
    });

    it('should throw NotFoundException when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getAllUsers('bad_tenant')).rejects.toThrow(NotFoundException);
    });

    it('should return all users when no tenantId provided', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await service.getAllUsers();

      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getUser', () => {
    it('should return a user by userId', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUser('user_1234abcd');

      expect(result.userId).toBe('user_1234abcd');
      expect(result.role).toBe('DISPATCHER');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUser('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user from different tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other_tenant', companyName: 'OtherCo' },
      });

      await expect(service.getUser('user_1234abcd', 'tenant_abc')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createUser', () => {
    it('should create a user with tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.createUser(
        {
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'DISPATCHER',
        },
        'tenant_abc',
      );

      expect(result.email).toBe('john@example.com');
      expect(prisma.user.create).toHaveBeenCalled();
      expect(notificationTriggers.userJoined).toHaveBeenCalledWith(1, 'John Doe', 'DISPATCHER');
    });

    it('should throw BadRequestException for non-super-admin without tenant', async () => {
      await expect(
        service.createUser({
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'DISPATCHER',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a SUPER_ADMIN without tenant', async () => {
      prisma.user.create.mockResolvedValue({
        ...mockUser,
        role: 'SUPER_ADMIN',
        tenant: null,
      });

      const result = await service.createUser({
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'SUPER_ADMIN',
      });

      expect(result.role).toBe('SUPER_ADMIN');
    });

    it('should throw NotFoundException if tenant not found during create', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.createUser(
          {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            role: 'DISPATCHER',
          },
          'bad_tenant',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUser', () => {
    it('should update a user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        firstName: 'Jane',
      });

      const result = await service.updateUser('user_1234abcd', { firstName: 'Jane' }, 'tenant_abc');

      expect(result.firstName).toBe('Jane');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUser('nonexistent', { firstName: 'Jane' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user from different tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other', companyName: 'Other' },
      });

      await expect(service.updateUser('user_1234abcd', { firstName: 'Jane' }, 'tenant_abc')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when modifying OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        role: 'OWNER',
      });

      await expect(service.updateUser('user_1234abcd', { firstName: 'Jane' })).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-OWNER promotes to ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.updateUser('user_1234abcd', { role: 'ADMIN' }, undefined, {
          role: 'ADMIN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when promoting to OWNER or SUPER_ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.updateUser('user_1234abcd', { role: 'OWNER' })).rejects.toThrow(ForbiddenException);

      await expect(service.updateUser('user_1234abcd', { role: 'SUPER_ADMIN' })).rejects.toThrow(ForbiddenException);
    });

    it('should trigger role changed notification on role change', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { id: 1, tenantId: 'tenant_abc', companyName: 'TestCo' },
      });
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        role: 'ADMIN',
      });

      await service.updateUser('user_1234abcd', { role: 'ADMIN' }, undefined, {
        role: 'OWNER',
      });

      expect(notificationTriggers.userRoleChanged).toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    it('should soft delete (deactivate) a user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });

      const result = await service.deleteUser('user_1234abcd');

      expect(result.message).toBe('User deactivated successfully');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { userId: 'user_1234abcd' },
        data: { isActive: false },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteUser('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when deleting OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, role: 'OWNER' });

      await expect(service.deleteUser('user_1234abcd')).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-OWNER deletes ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, role: 'ADMIN' });

      await expect(service.deleteUser('user_1234abcd', undefined, { role: 'ADMIN' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException when user from different tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other', companyName: 'Other' },
      });

      await expect(service.deleteUser('user_1234abcd', 'tenant_abc')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('toggleUserStatus', () => {
    it('should activate a user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: true });

      const result = await service.toggleUserStatus('user_1234abcd', true);

      expect(result.message).toBe('User activated successfully');
    });

    it('should deactivate a user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });

      const result = await service.toggleUserStatus('user_1234abcd', false);

      expect(result.message).toBe('User deactivated successfully');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.toggleUserStatus('nonexistent', true)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when toggling OWNER', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, role: 'OWNER' });

      await expect(service.toggleUserStatus('user_1234abcd', false)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when non-OWNER toggles ADMIN', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, role: 'ADMIN' });

      await expect(
        service.toggleUserStatus('user_1234abcd', false, undefined, {
          role: 'ADMIN',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user from different tenant', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other', companyName: 'Other' },
      });

      await expect(service.toggleUserStatus('user_1234abcd', false, 'tenant_abc')).rejects.toThrow(ForbiddenException);
    });
  });
});
