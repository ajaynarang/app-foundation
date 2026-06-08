import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OAuthClientsService } from '../oauth-clients.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$mocked'),
}));

describe('OAuthClientsService — Phase D admin surface', () => {
  let service: OAuthClientsService;
  let prisma: any;
  let cache: any;
  let events: any;

  const mockClient = {
    id: 1,
    clientId: 'sally_abc123',
    clientSecret: '$2b$10$hashedsecret',
    name: 'Test Client',
    description: null,
    redirectUris: ['http://localhost:3000/callback'],
    scopes: ['fleet:read'],
    clientType: 'confidential',
    isActive: true,
    tenantId: 7,
    createdByUserId: 1,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(() => {
    prisma = {
      oAuthClient: {
        findUnique: jest.fn().mockResolvedValue(mockClient),
        update: jest.fn().mockImplementation(async (args: any) => ({
          ...mockClient,
          ...(args.data ?? {}),
        })),
      },
      oAuthAccessToken: { updateMany: jest.fn() },
      oAuthRefreshToken: {
        updateMany: jest.fn(),
        // `assertNotRevoked` checks for cascade-revoked refresh tokens on
        // an inactive client. Default: no revoked tokens (pristine state).
        // Tests that exercise the revoked path override with mockResolvedValueOnce.
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    cache = { del: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn().mockResolvedValue(undefined) };

    service = new OAuthClientsService(
      prisma as unknown as PrismaService,
      cache as unknown as AppCacheService,
      events as unknown as DomainEventService,
    );
  });

  describe('rotateSecret', () => {
    it('updates the secret, returns plaintext, and emits ROTATED', async () => {
      const result = await service.rotateSecret('sally_abc123', 7);
      expect(result.clientSecret).toHaveLength(64); // 32 random bytes → hex
      expect(prisma.oAuthClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'sally_abc123' },
          data: expect.objectContaining({ clientSecret: expect.any(String) }),
        }),
      );
      expect(prisma.oAuthAccessToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.oAuthRefreshToken.updateMany).not.toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.OAUTH_CLIENT_ROTATED,
        '7',
        expect.objectContaining({ clientId: 'sally_abc123' }),
      );
    });

    it('throws NotFound when client does not exist', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.rotateSecret('bad', 7)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('pause / resume', () => {
    it('pause sets isActive=false and emits PAUSED', async () => {
      await service.pause('sally_abc123', 7);
      expect(prisma.oAuthClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId: 'sally_abc123' },
          data: { isActive: false },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.OAUTH_CLIENT_PAUSED, '7', expect.any(Object));
    });

    it('resume sets isActive=true when paused', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        isActive: false,
      });
      await service.resume('sally_abc123', 7);
      expect(prisma.oAuthClient.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: true } }));
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.OAUTH_CLIENT_RESUMED, '7', expect.any(Object));
    });

    it('pause is a BadRequest when already paused', async () => {
      prisma.oAuthClient.findUnique.mockResolvedValue({
        ...mockClient,
        isActive: false,
      });
      await expect(service.pause('sally_abc123', 7)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('revoke (cascades tokens)', () => {
    it('runs a transaction that revokes access + refresh tokens and sets isActive=false', async () => {
      await service.revoke('sally_abc123', 7);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(ops).toHaveLength(3);
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.OAUTH_CLIENT_REVOKED, '7', expect.any(Object));
    });
  });

  describe('updateScopes', () => {
    it('rejects unknown (non-enum) scopes', async () => {
      await expect(
        service.updateScopes('sally_abc123', 7, {
          scopes: ['not_a_scope'] as never,
        }),
      ).rejects.toThrow();
      expect(prisma.oAuthClient.update).not.toHaveBeenCalled();
    });

    it('rejects platform:admin', async () => {
      await expect(
        service.updateScopes('sally_abc123', 7, {
          scopes: ['platform:admin'] as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.oAuthClient.update).not.toHaveBeenCalled();
    });

    it('persists valid scopes and emits SCOPES_UPDATED', async () => {
      const result = await service.updateScopes('sally_abc123', 7, {
        scopes: ['fleet:read', 'loads:read'],
      });
      expect(result.clientId).toBe('sally_abc123');
      expect(prisma.oAuthClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { scopes: ['fleet:read', 'loads:read'] },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.OAUTH_CLIENT_SCOPES_UPDATED,
        '7',
        expect.objectContaining({ scopes: ['fleet:read', 'loads:read'] }),
      );
    });
  });
});
