import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../../../platform-glue/cache/cache.module';
import { InAppNotificationsModule } from '../../../notifications/notifications.module';

import { AiBudgetNudgeListener } from './ai-budget-nudge.listener';
import { AiBudgetSeederService } from './ai-budget-seeder.service';

/**
 * The AI money plane: plan-driven budgets and the notification when a workspace's cap is reached.
 *
 * The seeder runs on the four moments a workspace's plan can start or change: approval and plan change (the
 * platform's `TENANT_PROVISION_HOOKS`, bound in `platform-glue/hooks.module.ts`), personal signup (which calls the
 * same approval hook), and, for single mode, here at boot: the one implicit workspace is seeded and never approved.
 * Seeding is idempotent and leaves admin-edited budgets alone, so every boot is safe. A failure is logged and never
 * stops the app.
 */
@Module({
  imports: [PrismaModule, CacheModule, InAppNotificationsModule],
  providers: [AiBudgetSeederService, AiBudgetNudgeListener],
  exports: [AiBudgetSeederService],
})
export class AiProvisioningModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiProvisioningModule.name);

  constructor(
    private readonly seeder: AiBudgetSeederService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('multiTenancy.mode') !== 'single') return;
    const tenantId = this.config.get<number>('multiTenancy.implicitTenantId') ?? 1;
    try {
      await this.seeder.seedForTenant(tenantId);
    } catch (err) {
      this.logger.warn(`Single-mode AI budget seed failed for workspace ${tenantId}: ${(err as Error).message}`);
    }
  }
}
