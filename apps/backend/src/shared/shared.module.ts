import { Global, Module } from '@nestjs/common';
import { ExternalSourceGuard } from './guards/external-source.guard';
import { TimezoneService } from './services/timezone.service';
import { TenantJobRunService } from './services/tenant-job-run.service';
import { PrismaModule } from '../infrastructure/database/prisma.module';
import { CacheModule } from '../infrastructure/cache/cache.module';

/**
 * SharedModule provides common utilities, base classes, guards, and filters
 * that are used across multiple domains.
 *
 * This module is marked as @Global() so it's available everywhere without
 * explicit imports in every module.
 *
 * Exports:
 * - ExternalSourceGuard: Guard to prevent modification of external resources
 * - TimezoneService: Single source of truth for tenant-local date/hour resolution
 * - TenantJobRunService: Per-(tenant, job) idempotency stamps for time-of-day jobs
 * - BaseTenantController: Base controller with tenant utilities (imported directly)
 * - HttpExceptionFilter: Global exception filter (registered in AppModule)
 */
@Global()
@Module({
  imports: [PrismaModule, CacheModule],
  providers: [ExternalSourceGuard, TimezoneService, TenantJobRunService],
  exports: [ExternalSourceGuard, TimezoneService, TenantJobRunService],
})
export class SharedModule {}
