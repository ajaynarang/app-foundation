import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OAuthClientsService } from '../oauth-clients.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';

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
    clientId: 'sally_abc123',
    clientSecret: '$2b$10$hashedsecret',
    name: 'Test Client',
    description: 'A test client',
    redirectUris: ['http://localhost:3000/callback'],
    scopes: ['read:fleet'],
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

    service = new OAuthClientsService(
      prisma as unknown as PrismaService,
      cache as unknown as SallyCacheService,
      events as unknown as DomainEventService,
    );
  });

  describe('create', () => {
    it('should create a client and return raw secret', async () => {
      const result = await service.create(
        {
          name: 'Test',
          redirectUris: ['http://localhost:3000'],
          scopes: ['read:fleet'] as any,
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
      expect(result).toHaveLength(1);
      expect(result[0].clientId).toBe('sally_abc123');
      expect((result[0] as any).clientSecret).toBeUndefined();
    });

    it('should return global clients when tenantId is null', async () => {
      await service.findAll(null);
      expect(prisma.oAuthClient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: null } }));
    });
  });

  describe('findByClientId', () => {
    it('should return a client', async () => {
      const result = await service.findByClientId('sally_abc123', 1);
      expect(result.clientId).toBe('sally_abc123');
    });

    it('should throw NotFoundException when client not found', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.findByClientId('bad', 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when tenant mismatch', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        tenantId: 2,
      });
      await expect(service.findByClientId('sally_abc123', 1)).rejects.toThrow(ForbiddenException);
    });

    it('should allow null tenantId (global access)', async () => {
      const result = await service.findByClientId('sally_abc123', null);
      expect(result.clientId).toBe('sally_abc123');
    });
  });

  describe('update', () => {
    it('should update client fields', async () => {
      const result = await service.update('sally_abc123', { name: 'Updated' }, 1);
      expect(result.clientId).toBe('sally_abc123');
      expect(prisma.oAuthClient.update).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException when client not found', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.update('bad', { name: 'X' }, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when tenant mismatch', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        tenantId: 2,
      });
      await expect(service.update('sally_abc123', { name: 'X' }, 1)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revoke', () => {
    it('should revoke a client and its tokens', async () => {
      await service.revoke('sally_abc123', 1);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });

    it('should throw NotFoundException when client not found', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.revoke('bad', 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when tenant mismatch', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        tenantId: 2,
      });
      await expect(service.revoke('sally_abc123', 1)).rejects.toThrow(ForbiddenException);
    });
  });
});
