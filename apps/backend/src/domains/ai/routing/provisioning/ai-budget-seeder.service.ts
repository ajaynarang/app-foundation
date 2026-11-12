import { Injectable, Logger } from '@nestjs/common';
import { TenantPlan } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';

import { BUDGET_SEED_NOTE_PREFIX, PLAN_AI_BUDGETS, isSeederOwned } from './plan-ai-budgets';

/**
 * Plan to `TenantAiBudget` seeding. The seeder writes only rows it owns: an absent row, or one whose `notes` still
 * carries its `plan:` stamp. Once an admin edits a budget (any other note, or none), plan changes stop touching that
 * workspace for good.
 *
 * It runs when a workspace is approved, when its plan changes, when a personal workspace is created, and once at boot
 * for the single-mode workspace (`AiProvisioningModule`); `platform-glue/hooks.module.ts` binds the first three.
 * Idempotent: seeding the same plan twice writes the same row.
 */
@Injectable()
export class AiBudgetSeederService {
  private readonly logger = new Logger(AiBudgetSeederService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  /** Seed from the workspace's current plan. A missing workspace is a no-op. */
  async seedForTenant(tenantId: number): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
    if (!tenant) {
      this.logger.warn(`No workspace ${tenantId}; AI budget not seeded`);
      return;
    }
    await this.seedForPlan(tenantId, tenant.plan);
  }

  async seedForPlan(tenantId: number, plan: TenantPlan): Promise<void> {
    const budget = PLAN_AI_BUDGETS[plan];
    if (!budget) {
      this.logger.warn(`No AI budget preset for plan ${plan}; workspace ${tenantId} left untouched`);
      return;
    }

    const existing = await this.prisma.tenantAiBudget.findUnique({ where: { tenantId }, select: { notes: true } });
    if (!isSeederOwned(existing?.notes, existing !== null)) {
      this.logger.log(`Workspace ${tenantId} AI budget is admin-managed; plan ${plan} not applied`);
      return;
    }

    const data = { ...budget, notes: `${BUDGET_SEED_NOTE_PREFIX}${plan}` };
    await this.prisma.tenantAiBudget.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    // The pre-call check caches the budget row; drop it so the new caps apply on the next call.
    await this.cache.del(buildKey('app:ai-telemetry', 'budget', tenantId));
    this.logger.log(`Seeded AI budget for workspace ${tenantId} from plan ${plan}`);
  }
}
