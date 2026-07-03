import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiKeysService } from '../api-keys.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { createMockPrisma } from '../../../../test/mocks/prisma.mock';
import { FOUNDATION_DOMAIN_EVENTS as DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';

/**
 * Phase D — extended API-keys service surface: list-for-tenant, rotate,
 * pause, resume, revoke, updateScopes. All tenant-scoped via `user.tenantId`.
 */
describe('ApiKeysService — Phase D admin surface', () => {
  const prisma = createMockPrisma();
  const events = { emit: jest.fn() };
  let svc: ApiKeysService;

  const baseRow = {
    id: 501,
    key: 'sk_live_old',
    name: 'BI script',
    userId: 42,
    scopes: ['platform:read'] as string[],
    ipAllowlist: [] as string[],
    rateLimitPerMinute: 300,
    isWriteEnabled: false,
    requestCount: 0,
    lastUsedAt: null,
    isActive: true,
    createdAt: new Date('2026-04-10T00:00:00Z'),
    expiresAt: null,
    revokedAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();
    svc = mod.get(ApiKeysService);
  });

  describe('listForTenant', () => {
    it('returns only keys whose user belongs to the tenant, masking the secret', async () => {
      prisma.apiKey.findMany.mockResolvedValue([baseRow]);
      const result = await svc.listForTenant(7);
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { tenantId: 7 } },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].keyMasked).toMatch(/^sk_live_\*+…$/);
      expect(result[0]).not.toHaveProperty('key');
    });
  });

  describe('rotate', () => {
    it('revokes the old row and creates a new one with preserved scopes/ipAllowlist/rateLimit', async () => {
      const existing = {
        ...baseRow,
        scopes: ['platform:read', 'platform:write'],
        ipAllowlist: ['10.0.0.0/24'],
        rateLimitPerMinute: 120,
        isWriteEnabled: true,
      };
      prisma.apiKey.findFirst.mockResolvedValue(existing);
      prisma.$transaction.mockImplementation(async (ops: unknown[]) => {
        return [null, { ...existing, id: 502, key: 'sk_live_new' }];
      });

      const result = await svc.rotate(501, 7);

      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 501, user: { tenantId: 7 } },
        }),
      );
      expect(result.plaintextKey).toMatch(/^sk_live_/);
      expect(result.apiKey.id).toBe(502);
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.API_KEY_ROTATED,
        '7',
        expect.objectContaining({ oldApiKeyId: 501, newApiKeyId: 502 }),
      );
    });

    it('throws NotFound when the key is not in this tenant', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(svc.rotate(999, 7)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequest when the key is already revoked', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        revokedAt: new Date(),
      });
      await expect(svc.rotate(501, 7)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('pause / resume', () => {
    it('pause flips isActive=false and emits PAUSED', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(baseRow);
      prisma.apiKey.update.mockResolvedValue({});
      await svc.pause(501, 7);
      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 501 },
          data: { isActive: false },
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.API_KEY_PAUSED,
        '7',
        expect.objectContaining({ apiKeyId: 501 }),
      );
    });

    it('resume flips isActive=true and emits RESUMED', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(baseRow);
      prisma.apiKey.update.mockResolvedValue({});
      await svc.resume(501, 7);
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.API_KEY_RESUMED, '7', expect.any(Object));
    });

    it('pause on a revoked key is a BadRequest', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        revokedAt: new Date(),
      });
      await expect(svc.pause(501, 7)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('revokeForTenant', () => {
    it('sets revokedAt + isActive=false and emits REVOKED', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(baseRow);
      prisma.apiKey.update.mockResolvedValue({});
      await svc.revokeForTenant(501, 7);
      const call = prisma.apiKey.update.mock.calls[0][0];
      expect(call.data.isActive).toBe(false);
      expect(call.data.revokedAt).toBeInstanceOf(Date);
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.API_KEY_REVOKED,
        '7',
        expect.objectContaining({ apiKeyId: 501 }),
      );
    });
  });

  describe('updateScopes', () => {
    it('rejects platform:admin', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(baseRow);
      await expect(
        svc.updateScopes(501, 7, {
          scopes: ['platform:admin'] as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('rejects a write scope without an IP allowlist', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        ipAllowlist: [],
      });
      await expect(
        svc.updateScopes(501, 7, {
          scopes: ['platform:write'],
          ipAllowlist: [],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it('allows a write scope when an IP allowlist is provided', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ ...baseRow });
      prisma.apiKey.update.mockResolvedValue({
        ...baseRow,
        scopes: ['platform:write'],
        ipAllowlist: ['10.0.0.0/24'],
        isWriteEnabled: true,
      });

      await svc.updateScopes(501, 7, {
        scopes: ['platform:write'],
        ipAllowlist: ['10.0.0.0/24'],
      });

      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scopes: ['platform:write'],
            ipAllowlist: ['10.0.0.0/24'],
            isWriteEnabled: true,
          }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.API_KEY_SCOPES_UPDATED,
        '7',
        expect.objectContaining({ apiKeyId: 501 }),
      );
    });

    it('allows a read-only scope with no ip allowlist', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ ...baseRow });
      prisma.apiKey.update.mockResolvedValue({
        ...baseRow,
        scopes: ['platform:read'],
        isWriteEnabled: false,
      });

      const out = await svc.updateScopes(501, 7, {
        scopes: ['platform:read'],
        ipAllowlist: [],
      });

      expect(out.isWriteEnabled).toBe(false);
      expect(prisma.apiKey.update).toHaveBeenCalled();
    });

    it('preserves existing ipAllowlist when dto omits it', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        ipAllowlist: ['10.0.0.0/24'],
      });
      prisma.apiKey.update.mockResolvedValue({
        ...baseRow,
        ipAllowlist: ['10.0.0.0/24'],
        scopes: ['platform:write'],
        isWriteEnabled: true,
      });

      await svc.updateScopes(501, 7, { scopes: ['platform:write'] });

      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ipAllowlist: ['10.0.0.0/24'],
          }),
        }),
      );
    });

    it('refuses to update a revoked key', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        revokedAt: new Date(),
      });
      await expect(svc.updateScopes(501, 7, { scopes: ['platform:read'] })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
