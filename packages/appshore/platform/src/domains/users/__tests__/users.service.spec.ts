import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { USER_LIFECYCLE_HOOKS } from '../../platform-hooks';
import { fixtureModel, tiedTimestamps, walkCursorList } from '../../../test/helpers';

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
    role: 'MEMBER',
    isActive: true,
    emailVerified: true,
    createdAt: new Date('2026-01-01'),
    lastLoginAt: new Date('2026-03-01'),
    tenant: { tenantId: 'tenant_abc', companyName: 'TestCo' },
  };

  beforeEach(async () => {
    prisma = {
      tenant: { findUnique: jest.fn() },
      user: {
        findMany: jest.fn(),
        count: jest.fn(),
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
          provide: USER_LIFECYCLE_HOOKS,
          useValue: notificationTriggers,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('listUsers: a cursor list, newest first', () => {
    it('lists the users of a given tenant, without the Int key', async () => {
      prisma.tenant.findUnique.mockResolvedValue(mockTenant);
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers('tenant_abc');

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_abc' },
      });
      expect(result).toMatchObject({ nextCursor: null, total: 1 });
      expect(result.items[0].userId).toBe('user_1234abcd');
      expect(result.items[0].email).toBe('john@example.com');
      expect(prisma.user.findMany.mock.calls[0][0].select).not.toHaveProperty('id');
    });

    it('should throw NotFoundException when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.listUsers('bad_tenant')).rejects.toThrow(NotFoundException);
    });

    it('lists every tenant when no tenantId is provided', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers();

      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(1);
    });

    describe('walking pages over a fixture', () => {
      // Users imported together share a timestamp; one super admin and one other-tenant user must never appear.
      const stamps = tiedTimestamps(8);
      const rows = stamps.map((createdAt, index) => ({
        id: index + 1,
        userId: `user_${(index * 5) % 8}`,
        tenantId: index === 7 ? 99 : 1,
        email: `person${index}@example.com`,
        firstName: index === 2 ? 'Ada' : 'Sam',
        lastName: 'Lovelace',
        role: index === 6 ? 'SUPER_ADMIN' : 'MEMBER',
        createdAt,
      }));

      beforeEach(() => {
        prisma.tenant.findUnique.mockResolvedValue({ ...mockTenant, id: 1 });
        Object.assign(prisma.user, fixtureModel(rows));
      });

      it("returns each of the tenant's users once, ties included, and never a super admin", async () => {
        const { pages, items } = await walkCursorList((cursor) =>
          service.listUsers('tenant_abc', { limit: 2, cursor }),
        );

        expect(pages.map((page) => page.length)).toEqual([2, 2, 2]);
        expect(items.map((user) => user.userId).sort()).toEqual(
          ['user_0', 'user_5', 'user_2', 'user_7', 'user_4', 'user_1'].sort(),
        );
        const times = items.map((user) => user.createdAt.getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
      });

      it('searches by name or email and counts only what matches', async () => {
        const page = await service.listUsers('tenant_abc', { q: 'ada' });
        expect(page.items.map((user) => user.firstName)).toEqual(['Ada']);
        expect(page.total).toBe(1);
      });

      it('keeps the search on every page: the keyset never replaces the search OR', async () => {
        // Sam and Ada alternate, three to a millisecond: a page that dropped the search would hold an Ada.
        const alternating = tiedTimestamps(9).map((createdAt, index) => ({
          id: index + 1,
          userId: `user_${(index * 4) % 9}`,
          tenantId: 1,
          email: `person${index}@example.com`,
          firstName: index % 2 === 0 ? 'Sam' : 'Ada',
          lastName: 'Lovelace',
          role: 'MEMBER',
          createdAt,
        }));
        Object.assign(prisma.user, fixtureModel(alternating));

        const { pages, items } = await walkCursorList(async (cursor) => {
          const page = await service.listUsers('tenant_abc', { q: 'sam', limit: 2, cursor });
          expect(page.total).toBe(5);
          return page;
        });

        expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
        for (const page of pages) expect(page.every((user) => user.firstName === 'Sam')).toBe(true);
        expect(new Set(items.map((user) => user.userId)).size).toBe(5);
      });

      it('answers 400 on a cursor it did not issue, before any query runs', async () => {
        await expect(service.listUsers('tenant_abc', { cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
        expect(prisma.user.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('getUser', () => {
    it('should return a user by userId', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUser('user_1234abcd');

      expect(result.userId).toBe('user_1234abcd');
      expect(result.role).toBe('MEMBER');
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUser('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it("answers 404 for another workspace's user: a 403 would confirm it exists", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other_tenant', companyName: 'OtherCo' },
      });

      await expect(service.getUser('user_1234abcd', 'tenant_abc')).rejects.toThrow(NotFoundException);
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
          role: 'MEMBER',
        },
        'tenant_abc',
      );

      expect(result.email).toBe('john@example.com');
      expect(prisma.user.create).toHaveBeenCalled();
      expect(notificationTriggers.userJoined).toHaveBeenCalledWith(1, 'John Doe', 'MEMBER');
    });

    it('should throw BadRequestException for non-super-admin without tenant', async () => {
      await expect(
        service.createUser({
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'MEMBER',
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
            role: 'MEMBER',
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

    it("answers 404 for another workspace's user: a 403 would confirm it exists", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other', companyName: 'Other' },
      });

      await expect(service.updateUser('user_1234abcd', { firstName: 'Jane' }, 'tenant_abc')).rejects.toThrow(
        NotFoundException,
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

      // DELETE answers 204: the service returns nothing.
      await expect(service.deleteUser('user_1234abcd')).resolves.toBeUndefined();

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

    it("answers 404 for another workspace's user: a 403 would confirm it exists", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other', companyName: 'Other' },
      });

      await expect(service.deleteUser('user_1234abcd', 'tenant_abc')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleUserStatus', () => {
    it('should activate a user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: true });

      const result = await service.toggleUserStatus('user_1234abcd', true);

      // The action answers the user as they are now, not an acknowledgement.
      expect(result).toMatchObject({ userId: 'user_1234abcd' });
      expect(result).not.toHaveProperty('message');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { userId: 'user_1234abcd' }, data: { isActive: true } });
    });

    it('should deactivate a user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });

      const result = await service.toggleUserStatus('user_1234abcd', false);

      expect(result).toMatchObject({ userId: 'user_1234abcd' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { userId: 'user_1234abcd' },
        data: { isActive: false },
      });
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

    it("answers 404 for another workspace's user: a 403 would confirm it exists", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        tenant: { tenantId: 'other', companyName: 'Other' },
      });

      await expect(service.toggleUserStatus('user_1234abcd', false, 'tenant_abc')).rejects.toThrow(NotFoundException);
    });
  });
});
