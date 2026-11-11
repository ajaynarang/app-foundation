import { NotFoundException } from '@nestjs/common';
import { OAuthClientsService } from '../oauth-clients.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { fixtureModel, tiedTimestamps, walkCursorList } from '../../../test/helpers';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';

jest.mock('nanoid', () => ({
  nanoid: () => 'mocked_nanoid_32chars_here_xxxxx',
}));

describe('OAuthClientsService', () => {
  let service: OAuthClientsService;
  let prisma: any;
  let cache: any;
  let events: any;

  const mockClient = {
    id: 1,
    clientId: 'app_abc123',
    clientSecret: '$2b$10$hashedsecret',
    name: 'Test Client',
    description: 'A test client',
    redirectUris: ['http://localhost:3000/callback'],
    scopes: ['platform:read'],
    clientType: 'confidential',
    isActive: true,
    tenantId: 1,
    createdByUserId: 1,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      oAuthClient: {
        create: jest.fn().mockResolvedValue(mockClient),
        findMany: jest.fn().mockResolvedValue([mockClient]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(mockClient),
        update: jest.fn().mockResolvedValue(mockClient),
      },
      oAuthAccessToken: { updateMany: jest.fn() },
      oAuthRefreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
      del: jest.fn().mockResolvedValue(undefined),
    };
    events = { emit: jest.fn().mockResolvedValue(undefined) };

    service = new OAuthClientsService(prisma, cache, events);
  });

  describe('create', () => {
    it('should create a client and return raw secret', async () => {
      const result = await service.create(
        {
          name: 'Test',
          redirectUris: ['http://localhost:3000'],
          scopes: ['platform:read'] as any,
          clientType: 'confidential' as const,
        },
        1,
        1,
      );
      expect(result.clientId).toBeDefined();
      expect(result.clientSecret).toBeDefined();
      expect(result.clientSecret).not.toContain('$2b$');
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return clients for a tenant', async () => {
      const result = await service.findAll(1);
      expect(result).toMatchObject({ nextCursor: null, total: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].clientId).toBe('app_abc123');
      expect((result.items[0] as any).clientSecret).toBeUndefined();
    });

    it('should return global clients when tenantId is null', async () => {
      await service.findAll(null);
      expect(prisma.oAuthClient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: null } }));
    });

    describe('walking pages over a fixture', () => {
      // Clients registered by one script share a timestamp; one belongs to another workspace.
      const stamps = tiedTimestamps(7);
      const rows = stamps.map((createdAt, index) => ({
        ...mockClient,
        id: index + 1,
        clientId: `app_${(index * 3) % 7}`,
        tenantId: index === 6 ? 2 : 1,
        createdAt,
      }));

      beforeEach(() => Object.assign(prisma.oAuthClient, fixtureModel(rows)));

      it('returns every client of the workspace once, ties included, and never its secret', async () => {
        const { pages, items } = await walkCursorList((cursor) => service.findAll(1, { limit: 4, cursor }));

        expect(pages.map((page) => page.length)).toEqual([4, 2]);
        expect(new Set(items.map((client) => client.clientId)).size).toBe(6);
        const times = items.map((client) => Date.parse(client.createdAt));
        expect(times).toEqual([...times].sort((a, b) => b - a));
        for (const client of items) expect(client).not.toHaveProperty('clientSecret');
      });

      it('orders by created_at then the public client id, and the total ignores the cursor', async () => {
        const first = await service.findAll(1, { limit: 5 });
        const second = await service.findAll(1, { limit: 5, cursor: first.nextCursor! });
        expect([first.total, second.total]).toEqual([6, 6]);
        expect(prisma.oAuthClient.findMany.mock.calls[0][0].orderBy).toEqual([
          { createdAt: 'desc' },
          { clientId: 'desc' },
        ]);
      });

      it('answers 400 on a cursor it did not issue, before any query runs', async () => {
        await expect(service.findAll(1, { cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
        expect(prisma.oAuthClient.findMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('findByClientId', () => {
    it('should return a client', async () => {
      const result = await service.findByClientId('app_abc123', 1);
      expect(result.clientId).toBe('app_abc123');
    });

    it('should throw NotFoundException when client not found', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.findByClientId('bad', 1)).rejects.toThrow(NotFoundException);
    });

    it("answers 404 for another workspace's client: a 403 would confirm it exists", async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        tenantId: 2,
      });
      await expect(service.findByClientId('app_abc123', 1)).rejects.toThrow(NotFoundException);
    });

    it('should allow null tenantId (global access)', async () => {
      const result = await service.findByClientId('app_abc123', null);
      expect(result.clientId).toBe('app_abc123');
    });
  });

  describe('update', () => {
    it('should update client fields', async () => {
      const result = await service.update('app_abc123', { name: 'Updated' }, 1);
      expect(result.clientId).toBe('app_abc123');
      expect(prisma.oAuthClient.update).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException when client not found', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.update('bad', { name: 'X' }, 1)).rejects.toThrow(NotFoundException);
    });

    it("answers 404 for another workspace's client: a 403 would confirm it exists", async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        tenantId: 2,
      });
      await expect(service.update('app_abc123', { name: 'X' }, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('revoke', () => {
    it('should revoke a client and its tokens', async () => {
      await service.revoke('app_abc123', 1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException when client not found', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.revoke('bad', 1)).rejects.toThrow(NotFoundException);
    });

    it("answers 404 for another workspace's client: a 403 would confirm it exists", async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        tenantId: 2,
      });
      await expect(service.revoke('app_abc123', 1)).rejects.toThrow(NotFoundException);
    });
  });
});
