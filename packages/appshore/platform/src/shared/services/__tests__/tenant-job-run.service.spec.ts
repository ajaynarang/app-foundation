import { TenantJobRunService } from '../tenant-job-run.service';

describe('TenantJobRunService', () => {
  const prisma = {
    tenantJobRun: { findUnique: jest.fn(), upsert: jest.fn() },
  } as any;
  let svc: TenantJobRunService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = new TenantJobRunService(prisma);
  });

  describe('hasRunOn', () => {
    it('returns false when no row exists for the (tenant, job)', async () => {
      prisma.tenantJobRun.findUnique.mockResolvedValue(null);
      expect(await svc.hasRunOn(1, 'alert-digest', '2026-05-29')).toBe(false);
    });

    it('returns false when the stored date is a different local day', async () => {
      prisma.tenantJobRun.findUnique.mockResolvedValue({ lastRunDate: new Date('2026-05-28T00:00:00.000Z') });
      expect(await svc.hasRunOn(1, 'alert-digest', '2026-05-29')).toBe(false);
    });

    it('returns true when the stored date matches the given local day', async () => {
      prisma.tenantJobRun.findUnique.mockResolvedValue({ lastRunDate: new Date('2026-05-29T00:00:00.000Z') });
      expect(await svc.hasRunOn(1, 'alert-digest', '2026-05-29')).toBe(true);
    });

    it('keys the lookup by tenantId + jobKey', async () => {
      prisma.tenantJobRun.findUnique.mockResolvedValue(null);
      await svc.hasRunOn(7, 'shield-audit', '2026-05-29');
      expect(prisma.tenantJobRun.findUnique).toHaveBeenCalledWith({
        where: { tenantId_jobKey: { tenantId: 7, jobKey: 'shield-audit' } },
        select: { lastRunDate: true },
      });
    });
  });

  describe('markRanOn', () => {
    it('upserts the local date as a UTC-midnight stamp keyed by (tenant, job)', async () => {
      prisma.tenantJobRun.upsert.mockResolvedValue({});
      await svc.markRanOn(7, 'shield-audit', '2026-05-29');
      const expectedDate = new Date('2026-05-29T00:00:00.000Z');
      expect(prisma.tenantJobRun.upsert).toHaveBeenCalledWith({
        where: { tenantId_jobKey: { tenantId: 7, jobKey: 'shield-audit' } },
        create: { tenantId: 7, jobKey: 'shield-audit', lastRunDate: expectedDate },
        update: { lastRunDate: expectedDate },
      });
    });
  });
});
