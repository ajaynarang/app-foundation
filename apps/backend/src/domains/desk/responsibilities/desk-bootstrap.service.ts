import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/database/prisma.service';

import { bootstrapDeskForTenant } from './bootstrap-desk-for-tenant';

/**
 * DeskBootstrapService — keeps per-tenant Desk state in sync with the
 * responsibility registry.
 *
 * Two triggers:
 *   1. OnModuleInit — at backend boot, sweep every ACTIVE tenant and
 *      upsert the 12 agents + 10 responsibilities. Safety net for
 *      tenants that existed before the Desk feature shipped, or that
 *      were approved while this service wasn't running.
 *   2. bootstrapForTenant(tenantDbId) — called by TenantsService.approveTenant
 *      the moment a tenant transitions from PENDING_APPROVAL → ACTIVE
 *      so onboarding doesn't have to wait for the next backend restart.
 *
 * The underlying bootstrap function is idempotent (upsert by (tenantId,
 * key) unique constraints), so the double-trigger is safe: if approve
 * fires first, the boot sweep is a no-op; if approve fires while the
 * service is unavailable, the boot sweep picks it up next start.
 */
@Injectable()
export class DeskBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DeskBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Starting Desk bootstrap sweep on module init…');
    try {
      await this.sweepActiveTenants();
    } catch (err) {
      // Never block app startup — log and move on. Individual tenants
      // missing Desk seed will be backfilled on their next approve
      // call or the next boot.
      this.logger.error(`Desk bootstrap sweep failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Run bootstrap for every ACTIVE tenant in the DB. Cheap because
   * bootstrap is idempotent — after the first run, subsequent sweeps
   * touch no rows unless the registry changed (new responsibilities
   * added, titles updated).
   */
  async sweepActiveTenants(): Promise<{
    tenantsProcessed: number;
    agentsUpserted: number;
    responsibilitiesUpserted: number;
    supervisorBackfilled: number;
  }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, tenantId: true },
    });

    this.logger.log(`Desk bootstrap sweep: ${tenants.length} ACTIVE tenants to check`);

    let agents = 0;
    let responsibilities = 0;
    let supervisorBackfilled = 0;

    for (const t of tenants) {
      try {
        const r = await bootstrapDeskForTenant(this.prisma, t.id);
        agents += r.agentsUpserted;
        responsibilities += r.responsibilitiesUpserted;
        supervisorBackfilled += r.supervisorBackfilled;
      } catch (err) {
        // One bad tenant shouldn't block the rest.
        this.logger.error(
          `Desk bootstrap failed for tenant ${t.tenantId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `Desk bootstrap sweep: ${tenants.length} tenants, ${agents} agents + ${responsibilities} responsibilities upserted, ${supervisorBackfilled} supervisors backfilled`,
    );

    return {
      tenantsProcessed: tenants.length,
      agentsUpserted: agents,
      responsibilitiesUpserted: responsibilities,
      supervisorBackfilled,
    };
  }

  /**
   * Bootstrap Desk for one newly-approved tenant. Safe to call multiple
   * times — upserts rather than inserts, so re-approving a tenant or
   * colliding with the boot sweep is fine.
   *
   * Called from TenantsService.approveTenant.
   */
  async bootstrapForTenant(tenantDbId: number): Promise<void> {
    try {
      const r = await bootstrapDeskForTenant(this.prisma, tenantDbId);
      this.logger.log(
        `Desk bootstrapped for tenant ${tenantDbId}: ${r.agentsUpserted} agents + ${r.responsibilitiesUpserted} responsibilities, ${r.supervisorBackfilled} supervisors backfilled`,
      );
    } catch (err) {
      // Don't throw — the tenant was already approved. Log and let the
      // next boot sweep retry.
      this.logger.error(
        `Desk bootstrap failed for tenant ${tenantDbId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
