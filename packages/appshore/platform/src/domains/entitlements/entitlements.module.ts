import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { PlansModule } from '../plans/plans.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { TenantEntitlementsService } from './tenant-entitlements.service';

/** The plan rule for routes (`PlanGuard`), jobs, handlers and AI tools, and the seat check. */
@Module({
  imports: [PrismaModule, PlansModule, FeatureFlagsModule],
  providers: [TenantEntitlementsService],
  exports: [TenantEntitlementsService],
})
export class EntitlementsModule {}
