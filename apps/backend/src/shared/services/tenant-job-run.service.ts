import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Per-(tenant, job) idempotency stamp for tenant-local time-of-day jobs.
 *
 * The hourly heartbeat asks `hasRunOn` before acting and calls `markRanOn`
 * after; both key on `(tenantId, jobKey)`, so a later tick or retry on the same
 * tenant-local day is a no-op. Replaces per-job DATE columns on the tenants
 * table — a new time-of-day job is a new `jobKey` value, not a schema change.
 */
@Injectable()
export class TenantJobRunService {
  constructor(private readonly prisma: PrismaService) {}

  /** True when `jobKey` already ran for `tenantId` on the given tenant-local date (YYYY-MM-DD). */
  async hasRunOn(tenantId: number, jobKey: string, localDate: string): Promise<boolean> {
    const run = await this.prisma.tenantJobRun.findUnique({
      where: { tenantId_jobKey: { tenantId, jobKey } },
      select: { lastRunDate: true },
    });
    return !!run && run.lastRunDate.toISOString().slice(0, 10) === localDate;
  }

  /** Record that `jobKey` ran for `tenantId` on the given tenant-local date. Idempotent upsert. */
  async markRanOn(tenantId: number, jobKey: string, localDate: string): Promise<void> {
    const lastRunDate = new Date(`${localDate}T00:00:00.000Z`);
    await this.prisma.tenantJobRun.upsert({
      where: { tenantId_jobKey: { tenantId, jobKey } },
      create: { tenantId, jobKey, lastRunDate },
      update: { lastRunDate },
    });
  }
}
