import { TimezoneService } from '../timezone.service';

describe('TimezoneService', () => {
  const prisma = { tenant: { findUnique: jest.fn() } } as any;
  const cache = { getOrSet: jest.fn((_k, fn) => fn()) } as any;
  let svc: TimezoneService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new TimezoneService(prisma, cache);
  });

  describe('resolveTenantTimezone', () => {
    it('returns the tenant timezone when valid', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ timezone: 'America/Chicago' });
      expect(await svc.resolveTenantTimezone(1)).toBe('America/Chicago');
    });

    it('falls back to UTC when tenant timezone is null', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ timezone: null });
      expect(await svc.resolveTenantTimezone(1)).toBe('UTC');
    });

    it('falls back to UTC when tenant timezone is an invalid IANA string', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ timezone: 'Not/AZone' });
      expect(await svc.resolveTenantTimezone(1)).toBe('UTC');
    });

    it('falls back to UTC when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      expect(await svc.resolveTenantTimezone(1)).toBe('UTC');
    });
  });

  describe('localDate', () => {
    it('returns YYYY-MM-DD for the given instant in the given tz', () => {
      // 2026-05-28T03:00:00Z is still 2026-05-27 in America/Chicago (UTC-5 DST)
      const instant = new Date('2026-05-28T03:00:00Z');
      expect(svc.localDate('America/Chicago', instant)).toBe('2026-05-27');
      expect(svc.localDate('UTC', instant)).toBe('2026-05-28');
    });

    it('falls back to UTC when tz is invalid', () => {
      const instant = new Date('2026-05-28T03:00:00Z');
      expect(svc.localDate('Not/AZone', instant)).toBe('2026-05-28');
    });
  });

  describe('localHour / localDayOfMonth', () => {
    it('returns the local clock hour in the tz', () => {
      const instant = new Date('2026-05-28T13:00:00Z'); // 08:00 in America/Chicago (UTC-5 DST)
      expect(svc.localHour('America/Chicago', instant)).toBe(8);
    });
    it('returns the local day-of-month in the tz', () => {
      const instant = new Date('2026-06-01T03:00:00Z'); // still May 31 in Chicago
      expect(svc.localDayOfMonth('America/Chicago', instant)).toBe(31);
    });
    it('falls back to UTC for an invalid tz when computing hour', () => {
      const instant = new Date('2026-05-28T13:00:00Z'); // 13:00 UTC
      expect(svc.localHour('Not/AZone', instant)).toBe(13);
    });
  });

  describe('default instant (now)', () => {
    it('localDate defaults to the current instant', () => {
      const result = svc.localDate('UTC');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
    it('localHour defaults to the current instant', () => {
      const result = svc.localHour('UTC');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(23);
    });
    it('localDayOfMonth defaults to the current instant', () => {
      const result = svc.localDayOfMonth('UTC');
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(31);
    });
  });
});
