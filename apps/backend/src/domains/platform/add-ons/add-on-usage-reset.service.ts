import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { TenantStatus } from '@prisma/client';
import type { JobEnvelope } from '@sally/shared-types';
import { AddOnsService } from './add-ons.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TimezoneService } from '../../../shared/services/timezone.service';
import { FINANCE_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';

/**
 * Owns `addon-usage-reset` on the `finance` queue. Metered add-on usage counters
 * gate billable usage, so this cron lives on FINANCE rather than BULK_OPS. A
 * QueueJobHandler — the single FinanceQueueProcessor dispatcher routes by name.
 */
@Injectable()
export class AddOnUsageResetService implements QueueJobHandler {
  readonly jobNames = [FINANCE_JOB_NAMES.ADDON_USAGE_RESET];
  private readonly logger = new Logger(AddOnUsageResetService.name);

  constructor(
    private readonly addOnsService: AddOnsService,
    private readonly prisma: PrismaService,
    private readonly timezoneService: TimezoneService,
  ) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<{ reset: number }> {
    return this.handleUsageReset();
  }

  /**
   * Wakes daily (cron: 0 1 * * *) and resets each tenant only when it is the
   * 1st-of-month in that tenant's local timezone. The reset is idempotent — the
   * per-tenant method guards on `usageResetAt`, so a same-day retry or a tenant
   * straddling a DST/UTC boundary cannot double-reset.
   */
  async handleUsageReset(): Promise<{ reset: number }> {
    this.logger.log('Running add-on usage reset (per-tenant local 1st-of-month)...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: TenantStatus.ACTIVE, jobsPaused: false },
      select: { id: true },
    });

    const now = new Date();
    let total = 0;
    for (const { id } of tenants) {
      const tz = await this.timezoneService.resolveTenantTimezone(id);
      if (this.timezoneService.localDayOfMonth(tz, now) !== 1) continue; // not the 1st locally

      // Period boundary = first day of the tenant-local current month, as a UTC date stamp.
      const localDate = this.timezoneService.localDate(tz, now); // YYYY-MM-01 on the local 1st
      const boundary = new Date(`${localDate.slice(0, 7)}-01T00:00:00.000Z`);
      const { reset } = await this.addOnsService.resetMonthlyUsageForTenant(id, boundary);
      total += reset;
    }

    this.logger.log(`Monthly usage reset complete. Reset ${total} add-on(s) across tenants on their local 1st.`);
    return { reset: total };
  }
}
