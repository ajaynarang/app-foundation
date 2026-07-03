import { Global, Module } from '@nestjs/common';
import { TimezoneService } from '@appshore/platform/shared/services/timezone.service';
import { TenantJobRunService } from '@appshore/platform/shared/services/tenant-job-run.service';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../platform-glue/cache/cache.module';

/**
 * SharedModule provides common utilities, base classes, guards, and filters
 * that are used across multiple domains.
 *
 * This module is marked as @Global() so it's available everywhere without
 * explicit imports in every module.
 *
 * Exports:
 * - TimezoneService: Single source of truth for tenant-local date/hour resolution
 * - TenantJobRunService: Per-(tenant, job) idempotency stamps for time-of-day jobs
 * - BaseTenantController: Base controller with tenant utilities (imported directly)
 * - HttpExceptionFilter: Global exception filter (registered in AppModule)
 */
@Global()
@Module({
  imports: [PrismaModule, CacheModule],
  providers: [TimezoneService, TenantJobRunService],
  exports: [TimezoneService, TenantJobRunService],
})
export class SharedModule {}
