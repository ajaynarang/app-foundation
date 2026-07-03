import { Global, Module } from '@nestjs/common';
import { TimezoneService } from '@appshore/platform/shared/services/timezone.service';
import { TenantJobRunService } from '@appshore/platform/shared/services/tenant-job-run.service';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../platform-glue/cache/cache.module';

/**
 * SharedModule re-exports two cross-domain services from @appshore/platform
 * as @Global() providers so domains can inject them without explicit imports:
 * - TimezoneService: Single source of truth for tenant-local date/hour resolution
 * - TenantJobRunService: Per-(tenant, job) idempotency stamps for time-of-day jobs
 */
@Global()
@Module({
  imports: [PrismaModule, CacheModule],
  providers: [TimezoneService, TenantJobRunService],
  exports: [TimezoneService, TenantJobRunService],
})
export class SharedModule {}
