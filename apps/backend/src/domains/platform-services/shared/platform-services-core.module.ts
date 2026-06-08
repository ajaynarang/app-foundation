import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { PlatformBalanceService } from '../platform-balance.service';

/**
 * Core module that provides PlatformServicesConfig, PlatformHealthService,
 * and PlatformBalanceService to all platform-service child modules.
 *
 * Each child module imports this instead of duplicating provider declarations.
 */
@Module({
  imports: [ConfigModule, CacheModule],
  providers: [PlatformServicesConfig, PlatformHealthService, PlatformBalanceService],
  exports: [CacheModule, PlatformServicesConfig, PlatformHealthService, PlatformBalanceService],
})
export class PlatformServicesCoreModule {}
