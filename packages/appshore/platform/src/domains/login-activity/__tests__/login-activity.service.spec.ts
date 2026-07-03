import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { LoginActivityService } from '../login-activity.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { createMockPrisma, createMockCache } from '../../../test/mocks';
import { LOGIN_ACTIVITY } from '../constants';
import { loginActivityCacheKeys, rolesKey } from '../login-activity.cache';

describe('LoginActivityService', () => {
  let service: LoginActivityService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let cache: ReturnType<typeof createMockCache>;

  const TENANT_ID = 7;
  const OTHER_TENANT_ID = 99;

  // Realistic-but-tiny ISO range; the rangeFilter widens `to` by 1 day.
  const RANGE = { from: '2026-05-19', to: '2026-05-26' };

  beforeEach(async () => {
    prisma = createMockPrisma();
    cache = createMockCache();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginActivityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<LoginActivityService>(LoginActivityService);
  });

  // Default findMany returns no rows; default count = 0. Override per-case.
  const stubListReturning = (rows: any[], total = rows.length) => {
    prisma.loginEvent.findMany.mockResolvedValue(rows);
    prisma.loginEvent.count.mockResolvedValue(total);
  };

  // ──────────────────────────────────────────────────────────────────────
  // SCOPE / ISOLATION
  // ──────────────────────────────────────────────────────────────────────

  describe('list — tenant scope / isolation', () => {
    it('refuses tenant-scoped call when tenantId is missing on scope', async () => {
      await expect(service.list({ isSuperAdmin: false } as any, { ...RANGE })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });

    it('forbids client-supplied tenantId from leaking outside tenant scope', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, tenantId: OTHER_TENANT_ID });

      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT_ID);
    });

    it('super-admin without tenantId returns cross-tenant (no tenantId in where)', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: true }, { ...RANGE });

      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBeUndefined();
    });

    it('super-admin with tenantId narrows by that tenant', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: true }, { ...RANGE, tenantId: OTHER_TENANT_ID });

      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe(OTHER_TENANT_ID);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // LIST FILTERS
  // ──────────────────────────────────────────────────────────────────────

  describe('list — filters', () => {
    it('statuses → where.status: { in: [...] }', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, statuses: ['SUCCESS', 'FAILED'] });
      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ in: ['SUCCESS', 'FAILED'] });
    });

    it('userQuery → ILIKE on email + firstName + lastName (case-insensitive contains)', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, userQuery: 'ajay' });
      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.user.is.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: expect.objectContaining({ contains: 'ajay', mode: 'insensitive' }) }),
          expect.objectContaining({ firstName: expect.objectContaining({ contains: 'ajay', mode: 'insensitive' }) }),
          expect.objectContaining({ lastName: expect.objectContaining({ contains: 'ajay', mode: 'insensitive' }) }),
        ]),
      );
    });

    it('ip → exact match', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, ip: '203.0.113.5' });
      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.ip).toBe('203.0.113.5');
    });

    it('roles → joined user.role in [...]', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, roles: ['DISPATCHER', 'ADMIN'] });
      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.user.is.role).toEqual({ in: ['DISPATCHER', 'ADMIN'] });
    });

    it('excludeSuperAdmin=true adds a role-not-SUPER_ADMIN constraint to the where clause', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: true }, { ...RANGE, excludeSuperAdmin: true });

      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(Array.isArray(where.AND)).toBe(true);
      expect(where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user: expect.objectContaining({
              is: expect.objectContaining({ role: { not: 'SUPER_ADMIN' } }),
            }),
          }),
        ]),
      );
    });

    it('excludeSuperAdmin=false (or omitted) does NOT add the SUPER_ADMIN exclusion', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: true }, { ...RANGE });

      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      // No AND array (or no entry that excludes SUPER_ADMIN)
      const hasExclusion =
        Array.isArray(where.AND) && where.AND.some((c: any) => c?.user?.is?.role?.not === 'SUPER_ADMIN');
      expect(hasExclusion).toBe(false);
    });

    it('from/to converted to Date and used as gte/lt on createdAt', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });
      const where = prisma.loginEvent.findMany.mock.calls[0][0].where;
      expect(where.createdAt.gte).toBeInstanceOf(Date);
      expect(where.createdAt.lt).toBeInstanceOf(Date);
      expect(where.createdAt.gte.getTime()).toBe(Date.parse('2026-05-19'));
      // `to` is inclusive — service should bump by 1 day for lt
      expect(where.createdAt.lt.getTime()).toBe(Date.parse('2026-05-26') + 86_400_000);
    });

    it('rejects invalid dates with BadRequestException', async () => {
      await expect(
        service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { from: 'not-a-date', to: 'also-not' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects ranges exceeding the configured maximum', async () => {
      await expect(
        service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { from: '2025-01-01', to: '2026-05-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // ORDER / PAGINATION / DEVICE LABEL
  // ──────────────────────────────────────────────────────────────────────

  describe('list — ordering, pagination, device label', () => {
    it('default order is createdAt desc', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });
      const args = prisma.loginEvent.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('respects limit + offset and returns total', async () => {
      stubListReturning([], 412);
      const res = await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, limit: 25, offset: 50 });
      const args = prisma.loginEvent.findMany.mock.calls[0][0];
      expect(args.take).toBe(25);
      expect(args.skip).toBe(50);
      expect(res.total).toBe(412);
      expect(res.limit).toBe(25);
      expect(res.offset).toBe(50);
    });

    it('caps page size at MAX_PAGE_LIMIT and defaults to DEFAULT_PAGE_LIMIT', async () => {
      stubListReturning([]);
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, limit: 9999 });
      expect(prisma.loginEvent.findMany.mock.calls[0][0].take).toBe(LOGIN_ACTIVITY.MAX_PAGE_LIMIT);

      prisma.loginEvent.findMany.mockClear();
      await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });
      expect(prisma.loginEvent.findMany.mock.calls[0][0].take).toBe(LOGIN_ACTIVITY.DEFAULT_PAGE_LIMIT);
    });

    it('returns parsed device labels from user-agent', async () => {
      const row = {
        id: 1,
        createdAt: new Date('2026-05-25T12:00:00Z'),
        status: 'SUCCESS',
        ip: '1.2.3.4',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        deviceId: null,
        sessionId: 'sess-1',
        failReason: null,
        userId: 42,
        tenantId: TENANT_ID,
        user: { id: 42, email: 'a@b.com', firstName: 'A', lastName: 'B', role: 'DISPATCHER' },
      };
      stubListReturning([row], 1);

      const res = await service.list({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });
      expect(res.items[0].deviceLabel).toMatch(/Chrome|Mac/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // SUMMARY — KPIs + CACHE
  // ──────────────────────────────────────────────────────────────────────

  describe('summary — KPIs + delta', () => {
    const stubSummary = (
      overrides: {
        totalSignIns?: number;
        failedAttempts?: number;
        prevFailed?: number;
        uniqueUsers?: Array<{ userId: number }>;
        uniqueIps?: Array<{ ip: string }>;
        brute?: Array<{ userId: number; _count: { _all: number } }>;
        recent?: any[];
      } = {},
    ) => {
      const counts = [overrides.totalSignIns ?? 0, overrides.failedAttempts ?? 0, overrides.prevFailed ?? 0];
      let countCall = 0;
      prisma.loginEvent.count.mockImplementation(async () => counts[countCall++] ?? 0);
      prisma.loginEvent.groupBy.mockImplementation(async (args: any) => {
        if (args.by?.[0] === 'userId' && args._count) return overrides.brute ?? [];
        if (args.by?.[0] === 'userId') return overrides.uniqueUsers ?? [];
        if (args.by?.[0] === 'ip') return overrides.uniqueIps ?? [];
        return [];
      });
      prisma.loginEvent.findMany.mockResolvedValue(overrides.recent ?? []);
      prisma.user.findMany.mockResolvedValue([]);
    };

    it('sums sign-ins, failed attempts, unique users, unique IPs for range', async () => {
      stubSummary({
        totalSignIns: 120,
        failedAttempts: 8,
        prevFailed: 4,
        uniqueUsers: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
        uniqueIps: [{ ip: 'a' }, { ip: 'b' }],
      });

      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });

      expect(res.kpis.totalSignIns).toBe(120);
      expect(res.kpis.failedAttempts).toBe(8);
      expect(res.kpis.uniqueUsers).toBe(3);
      expect(res.kpis.uniqueIps).toBe(2);
    });

    it('failedDeltaPct = +100% when failed doubles vs prior', async () => {
      stubSummary({ failedAttempts: 8, prevFailed: 4 });
      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });
      expect(res.kpis.failedDeltaPct).toBe(100);
    });

    it('failedDeltaPct = 0 when both prior and current are 0', async () => {
      stubSummary({ failedAttempts: 0, prevFailed: 0 });
      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });
      expect(res.kpis.failedDeltaPct).toBe(0);
    });
  });

  describe('summary — notable detection', () => {
    it('brute-force suspects: returns userId/email/count from groupBy, capped, sorted by count', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockImplementation(async (args: any) => {
        if (args.by?.[0] === 'userId' && args._count) {
          return [
            { userId: 11, _count: { _all: 12 } },
            { userId: 22, _count: { _all: 7 } },
          ];
        }
        return [];
      });
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: 11, email: 'one@x.com' },
        { id: 22, email: 'two@x.com' },
      ]);

      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });

      expect(res.notable.bruteForceSuspects).toHaveLength(2);
      expect(res.notable.bruteForceSuspects[0]).toMatchObject({ userId: 11, email: 'one@x.com', count: 12 });
      // hasOneHourBurst is documented as the v1 simplification; just ensure the flag is present
      expect(res.notable.bruteForceSuspects[0]).toHaveProperty('hasOneHourBurst');
    });

    it('brute-force suspects: groupBy is called with having gte = BRUTE_FORCE_FAIL_THRESHOLD and capped at NOTABLE_LIST_CAP', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockResolvedValue([]);
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });

      const bruteCall = prisma.loginEvent.groupBy.mock.calls.find((c: any[]) => c[0]?._count !== undefined);
      expect(bruteCall).toBeDefined();
      expect(bruteCall[0].having.userId._count.gte).toBe(LOGIN_ACTIVITY.BRUTE_FORCE_FAIL_THRESHOLD);
      expect(bruteCall[0].take).toBe(LOGIN_ACTIVITY.NOTABLE_LIST_CAP);
    });

    it('new-IP sign-ins: only emits when (userId, ip) absent in 30-day lookback', async () => {
      prisma.loginEvent.count
        // 3 baseline KPI counts (totalSignIns, failedAttempts, prevFailed)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        // per-event lookback counts: first event "new" (0), second "seen" (1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      prisma.loginEvent.groupBy.mockResolvedValue([]);
      prisma.loginEvent.findMany.mockResolvedValue([
        {
          id: 1,
          createdAt: new Date('2026-05-25T12:00:00Z'),
          status: 'SUCCESS',
          ip: '1.1.1.1',
          userId: 11,
          user: { id: 11, email: 'one@x.com' },
          tenant: { id: TENANT_ID, timezone: 'UTC' },
        },
        {
          id: 2,
          createdAt: new Date('2026-05-25T12:30:00Z'),
          status: 'SUCCESS',
          ip: '2.2.2.2',
          userId: 22,
          user: { id: 22, email: 'two@x.com' },
          tenant: { id: TENANT_ID, timezone: 'UTC' },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });

      expect(res.notable.newIpSignIns).toHaveLength(1);
      expect(res.notable.newIpSignIns[0]).toMatchObject({ eventId: 1, userId: 11, ip: '1.1.1.1' });
    });

    it('off-hours sign-ins: flags events outside 6..22 in the tenant timezone', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockResolvedValue([]);
      // 3am UTC = clearly off-hours in UTC
      prisma.loginEvent.findMany.mockResolvedValue([
        {
          id: 9,
          createdAt: new Date('2026-05-25T03:00:00Z'),
          status: 'SUCCESS',
          ip: '5.5.5.5',
          userId: 11,
          user: { id: 11, email: 'night@x.com' },
          tenant: { id: TENANT_ID, timezone: 'UTC' },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });

      expect(res.notable.offHoursSignIns).toHaveLength(1);
      expect(res.notable.offHoursSignIns[0]).toMatchObject({ eventId: 9, userId: 11, ip: '5.5.5.5' });
      expect(res.timezoneUsed).toBe('UTC');
    });

    it('off-hours: events at noon UTC are not flagged when tenant timezone is UTC', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockResolvedValue([]);
      prisma.loginEvent.findMany.mockResolvedValue([
        {
          id: 1,
          createdAt: new Date('2026-05-25T12:00:00Z'),
          status: 'SUCCESS',
          ip: '5.5.5.5',
          userId: 11,
          user: { id: 11, email: 'day@x.com' },
          tenant: { id: TENANT_ID, timezone: 'UTC' },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });
      expect(res.notable.offHoursSignIns).toHaveLength(0);
    });
  });

  describe('summary — cache', () => {
    it('uses getOrSet with key that includes scope + range + rolesKey', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockResolvedValue([]);
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE, roles: ['ADMIN', 'DISPATCHER'] });

      expect(cache.getOrSet).toHaveBeenCalledTimes(1);
      const [keyArg, , ttlArg] = cache.getOrSet.mock.calls[0];
      expect(keyArg).toBe(
        loginActivityCacheKeys.summary({
          tenantId: TENANT_ID,
          from: RANGE.from,
          to: RANGE.to,
          rolesKey: rolesKey(['ADMIN', 'DISPATCHER']),
          excludeSuperAdmin: false,
        }),
      );
      // TTL must be passed in MILLISECONDS
      expect(ttlArg).toBe(LOGIN_ACTIVITY.SUMMARY_CACHE_TTL_SECONDS * 1000);
    });

    it('excludeSuperAdmin=true affects summary where-clause AND is part of the cache key', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockResolvedValue([]);
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.summary({ isSuperAdmin: true }, { ...RANGE, excludeSuperAdmin: true });

      // Cache key segment for excludeSuperAdmin = "no-super"
      const keyArg = cache.getOrSet.mock.calls[0][0];
      expect(keyArg).toContain(':no-super');

      // The role-not-SUPER_ADMIN constraint reaches the underlying KPI queries.
      const totalSignInsWhere = prisma.loginEvent.count.mock.calls[0][0].where;
      expect(Array.isArray(totalSignInsWhere.AND)).toBe(true);
      expect(totalSignInsWhere.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            user: expect.objectContaining({
              is: expect.objectContaining({ role: { not: 'SUPER_ADMIN' } }),
            }),
          }),
        ]),
      );
    });

    it('excludeSuperAdmin=true and =false yield distinct cache keys', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockResolvedValue([]);
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.summary({ isSuperAdmin: true }, { ...RANGE, excludeSuperAdmin: true });
      const keyWithExclusion = cache.getOrSet.mock.calls[0][0];

      cache.getOrSet.mockClear();
      await service.summary({ isSuperAdmin: true }, { ...RANGE, excludeSuperAdmin: false });
      const keyWithoutExclusion = cache.getOrSet.mock.calls[0][0];

      expect(keyWithExclusion).not.toBe(keyWithoutExclusion);
    });

    it('super-admin cross-tenant call uses "all" in the tenant segment', async () => {
      prisma.loginEvent.count.mockResolvedValue(0);
      prisma.loginEvent.groupBy.mockResolvedValue([]);
      prisma.loginEvent.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.summary({ isSuperAdmin: true }, { ...RANGE });

      const key = cache.getOrSet.mock.calls[0][0];
      expect(key).toContain(':all:');
    });

    it('returns cached value without recomputing when cache hits', async () => {
      const cached = {
        kpis: { totalSignIns: 5, failedAttempts: 0, failedDeltaPct: 0, uniqueUsers: 0, uniqueIps: 0 },
        notable: { bruteForceSuspects: [], newIpSignIns: [], offHoursSignIns: [] },
        timezoneUsed: 'UTC',
      };
      cache.getOrSet.mockImplementationOnce(async () => cached);

      const res = await service.summary({ isSuperAdmin: false, tenantId: TENANT_ID }, { ...RANGE });

      expect(res).toBe(cached);
      // No Prisma calls when the cache short-circuits
      expect(prisma.loginEvent.count).not.toHaveBeenCalled();
      expect(prisma.loginEvent.groupBy).not.toHaveBeenCalled();
    });
  });
});
