import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiKeysService } from '../api-keys.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OutboxService } from '../../../infrastructure/events/outbox.service';
import { createMockOutbox } from '../../../test/mocks/outbox.mock';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { fixtureModel, tiedTimestamps, walkCursorList } from '../../../test/helpers';
import { FOUNDATION_DOMAIN_EVENTS as DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';

/**
 * Phase D — extended API-keys service surface: list-for-tenant, rotate,
 * pause, resume, revoke, updateScopes. All tenant-scoped via `user.tenantId`.
 */
describe('ApiKeysService — Phase D admin surface', () => {
  const prisma = createMockPrisma();
  const events = createMockOutbox(prisma);
  let svc: ApiKeysService;

  const baseRow = {
    id: 501,
    keyHash: 'a'.repeat(64),
    keyPrefix: 'sk_live_',
    keyLast4: 'AbCd',
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
        { provide: OutboxService, useValue: events },
      ],
    }).compile();
    svc = mod.get(ApiKeysService);
  });

  describe('listForTenant', () => {
    it('returns only keys whose user belongs to the tenant, masking the secret', async () => {
      prisma.apiKey.findMany.mockResolvedValue([baseRow]);
      prisma.apiKey.count.mockResolvedValue(1);
      const result = await svc.listForTenant(7);
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user: { tenantId: 7 } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 51,
        }),
      );
      expect(result).toMatchObject({ nextCursor: null, total: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].keyMasked).toBe('sk_live_…AbCd');
      expect(result.items[0]).not.toHaveProperty('key');
      expect(result.items[0]).not.toHaveProperty('keyHash');
    });

    describe('walking pages over a fixture', () => {
      // Keys minted in one batch share a timestamp. One belongs to another tenant, one is revoked.
      const stamps = tiedTimestamps(8);
      const rows = stamps.map((createdAt, index) => ({
        ...baseRow,
        id: ((index * 5) % 8) + 1,
        userId: index === 7 ? 99 : 42,
        user: { tenantId: index === 7 ? 99 : 7 },
        revokedAt: index === 0 ? new Date('2026-03-02T00:00:00.000Z') : null,
        createdAt,
      }));

      beforeEach(() => Object.assign(prisma.apiKey, fixtureModel(rows)));

      it('returns every key of the tenant once, ties included, and none of another tenant', async () => {
        const { pages, items } = await walkCursorList((cursor) => svc.listForTenant(7, { limit: 3, cursor }));

        expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
        expect(new Set(items.map((key) => key.id)).size).toBe(7);
        const times = items.map((key) => Date.parse(key.createdAt));
        expect(times).toEqual([...times].sort((a, b) => b - a));
      });

      it("pages the caller's own live keys and leaves revoked ones out of the page and the total", async () => {
        const { items } = await walkCursorList((cursor) => svc.findAll(42, { limit: 4, cursor }));
        expect(items).toHaveLength(6);
        expect((await svc.findAll(42, { limit: 1 })).total).toBe(6);
      });

      it('answers 400 on a cursor it did not issue, before any query runs', async () => {
        await expect(svc.listForTenant(7, { cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
        expect(prisma.apiKey.findMany).not.toHaveBeenCalled();
      });
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
      prisma.apiKey.update.mockResolvedValue({ ...existing, revokedAt: new Date(), isActive: false });
      prisma.apiKey.create.mockResolvedValue({ ...existing, id: 502, keyLast4: 'WxYz' });

      const result = await svc.rotate(501, 7);

      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 501, user: { tenantId: 7 } },
        }),
      );
      expect(result.plaintextKey).toMatch(/^sk_live_/);
      expect(result.apiKey.id).toBe(502);
      // The revoke, the new row and the event commit together (one outbox transaction).
      expect(events.transaction).toHaveBeenCalledTimes(1);
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

    it('answers 409 INVALID_STATE when the key is already revoked', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        revokedAt: new Date(),
      });
      await expect(svc.rotate(501, 7)).rejects.toMatchObject({ status: 409, response: { code: 'INVALID_STATE' } });
    });
  });

  describe('pause / resume', () => {
    it('pause flips isActive=false and emits PAUSED', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(baseRow);
      prisma.apiKey.update.mockResolvedValue({ ...baseRow, isActive: false });
      const paused = await svc.pause(501, 7);
      // The action answers the key as it is now, not an empty acknowledgement.
      expect(paused).toMatchObject({ id: 501, isActive: false });
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
      prisma.apiKey.update.mockResolvedValue({ ...baseRow, isActive: true });
      const resumed = await svc.resume(501, 7);
      expect(resumed).toMatchObject({ id: 501, isActive: true });
      expect(events.emit).toHaveBeenCalledWith(DOMAIN_EVENTS.API_KEY_RESUMED, '7', expect.any(Object));
    });

    it('publishes nothing when the write fails: the event exists only if the change committed', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(baseRow);
      prisma.apiKey.update.mockRejectedValueOnce(new Error('connection lost'));
      await expect(svc.pause(501, 7)).rejects.toThrow('connection lost');
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('pause on a revoked key is 409 INVALID_STATE', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        revokedAt: new Date(),
      });
      await expect(svc.pause(501, 7)).rejects.toMatchObject({ status: 409, response: { code: 'INVALID_STATE' } });
    });
  });

  describe('revokeForTenant', () => {
    it('sets revokedAt + isActive=false and emits REVOKED', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(baseRow);
      prisma.apiKey.update.mockResolvedValue({ ...baseRow, isActive: false, revokedAt: new Date() });
      const revoked = await svc.revokeForTenant(501, 7);
      expect(revoked).toMatchObject({ id: 501, isActive: false });
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

    it('refuses to update a revoked key with 409 INVALID_STATE', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        ...baseRow,
        revokedAt: new Date(),
      });
      await expect(svc.updateScopes(501, 7, { scopes: ['platform:read'] })).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
    });
  });
});
