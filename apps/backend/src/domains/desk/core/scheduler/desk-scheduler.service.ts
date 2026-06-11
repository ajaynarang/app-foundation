import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { findResponsibilityDefinition } from '../../responsibilities';
import { TriggerService } from '../trigger/trigger.service';

import { isCronDueInWindow } from '../../../../shared/utils/cron-window';

/** Trigger `tz: 'tenant'` resolves to the tenant's IANA timezone; any other
 *  value (or absence) evaluates the cron in UTC. */
const TENANT_TZ_TOKEN = 'tenant';
const UTC = 'UTC';
const WINDOW_MS = 60_000;

type ScheduledRow = {
  key: string;
  tenantId: number;
  tenant: { timezone: string | null };
};

/**
 * Desk scheduler heartbeat service.
 *
 * Invoked every minute by the Inngest cron function `createDeskSchedulerFunction`
 * (see desk-scheduler.function.ts), which pulls this service from Nest DI via
 * the `nestApp()` bridge and calls `runHeartbeat(new Date())`. This replaced the
 * BullMQ `DESK_SCHEDULER` queue in the 2026-05-27 queue-topology redesign
 * (Phase 5) — the rest of Desk runs on Inngest, so the heartbeat does too. The
 * service is also resolvable via Nest DI for manual triggers (admin endpoint,
 * tests); the heartbeat logic itself is runtime-agnostic.
 *
 * Heartbeat semantics (when invoked):
 *   1. Find tenants with the master switch on (`deskScheduleEnabled`). None
 *      → cheap no-op (no per-responsibility query, no LLM cost).
 *   2. Load autonomy-armed + enabled + AVAILABLE responsibilities for
 *      those tenants in one indexed query (with the tenant's timezone). This
 *      query inlines the same gates as DeskResponsibilityService
 *      .canRunAutonomously — the canonical guard every non-manual trigger
 *      path must honor.
 *   3. For each row, read its scheduled cron from the registry definition,
 *      resolve the timezone (tenant-local or UTC), and check whether a fire
 *      fell in the just-elapsed one-minute window via the pure
 *      `isCronDueInWindow` helper.
 *   4. If due, dispatch `TriggerService.runByKey` — best-effort per row, so
 *      one tenant's failure never starves the rest.
 *
 * Double-tick safety: downstream dedupe (per-day Inngest idempotency key +
 * the Postgres partial unique index on open episodes) already guarantees a
 * rare overlapping tick can't double-run an episode — we rely on that rather
 * than adding new dedupe here.
 */
@Injectable()
export class DeskSchedulerService {
  private readonly logger = new Logger(DeskSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggers: TriggerService,
  ) {}

  /**
   * Evaluate every due responsibility for the one-minute window ending at
   * `tickTime` (exclusive). Pure, side-effecting only through `triggers`
   * and the logger — safe to call from Inngest, a Nest cron, or a test.
   */
  async runHeartbeat(tickTime: Date): Promise<void> {
    const windowStart = new Date(tickTime.getTime() - WINDOW_MS);
    const windowEnd = tickTime;

    const enabledTenants = await this.prisma.tenant.findMany({
      where: { deskScheduleEnabled: true },
      select: { id: true },
    });
    if (enabledTenants.length === 0) return; // master switch off everywhere — nothing autonomous runs

    const tenantIds = enabledTenants.map((t) => t.id);
    const rows = (await this.prisma.deskResponsibility.findMany({
      where: {
        tenantId: { in: tenantIds },
        autonomyEnabled: true,
        enabled: true,
        lifecycle: 'AVAILABLE',
      },
      select: {
        key: true,
        tenantId: true,
        tenant: { select: { timezone: true } },
      },
    })) as ScheduledRow[];

    let dispatched = 0;
    for (const row of rows) {
      if (this.isRowDue(row, windowStart, windowEnd)) {
        await this.dispatch(row);
        dispatched++;
      }
    }

    if (dispatched > 0) {
      this.logger.log(`desk-scheduler tick ${windowEnd.toISOString()}: dispatched ${dispatched} responsibility run(s)`);
    }
  }

  /** True when the row's scheduled cron fires within `[windowStart, windowEnd)`
   *  in its resolved timezone. False (skip) if the definition has no scheduled
   *  trigger or the cron/timezone is malformed. */
  private isRowDue(row: ScheduledRow, windowStart: Date, windowEnd: Date): boolean {
    const def = findResponsibilityDefinition(row.key);
    if (!def) return false;

    const scheduled = def.triggers.find((t) => t.kind === 'scheduled');
    if (!scheduled) return false;

    const tz = scheduled.tz === TENANT_TZ_TOKEN ? (row.tenant.timezone ?? UTC) : (scheduled.tz ?? UTC);
    return isCronDueInWindow(scheduled.cron, tz, windowStart, windowEnd);
  }

  private async dispatch(row: ScheduledRow): Promise<void> {
    try {
      await this.triggers.runByKey(row.key, row.tenantId);
    } catch (error) {
      // Best-effort: one tenant/responsibility failure must not stop the rest.
      this.logger.error(
        `desk-scheduler dispatch failed key=${row.key} tenant=${row.tenantId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
