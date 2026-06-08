import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { SyncService } from './sync.service';
import { TmsSyncService } from './tms-sync.service';
import { EldSyncService } from './eld-sync.service';
import { EldAuthErrorHandler } from './eld-auth-error-handler.service';
import { FleetSyncService } from './fleet-sync.service';
import { HosSyncService } from './hos-sync.service';
import { TelematicsSyncService } from './telematics-sync.service';
import { DvirSyncService } from './dvir-sync.service';
import { VehicleMatcher } from './matching/vehicle-matcher';
import { DriverMatcher } from './matching/driver-matcher';
import { TrailerMatcher } from './matching/trailer-matcher';
import { VehicleMerger } from './merging/vehicle-merger';
import { DriverMerger } from './merging/driver-merger';
import { TrailerMerger } from './merging/trailer-merger';
import { CredentialsService } from '../credentials/credentials.service';
import { AdaptersModule } from '../adapters/adapters.module';
import { OAuthModule } from '../oauth/oauth.module';
import { AlertsModule } from '../../operations/alerts/alerts.module';
import { InAppNotificationsModule } from '../../operations/notifications/notifications.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { EldDataCacheService } from '../services/eld-data-cache.service';

/**
 * SyncModule provides sync services for data synchronization.
 *
 * Sync scheduling is handled by Bull repeatable jobs (SyncQueueModule).
 * This module provides the service layer that does the actual sync work.
 *
 * Note: Adapters are imported from AdaptersModule (shared with IntegrationsModule)
 * Note: AlertsModule imported for EldSyncService failure alerting
 * Note: CacheModule + EldDataCacheService for Redis write-through during sync
 */
@Module({
  imports: [PrismaModule, AdaptersModule, AlertsModule, InAppNotificationsModule, CacheModule, OAuthModule],
  providers: [
    SyncService,
    TmsSyncService,
    EldSyncService,
    EldAuthErrorHandler,
    FleetSyncService,
    HosSyncService,
    TelematicsSyncService,
    DvirSyncService,
    EldDataCacheService,
    VehicleMatcher,
    DriverMatcher,
    TrailerMatcher,
    VehicleMerger,
    DriverMerger,
    TrailerMerger,
    CredentialsService,
  ],
  exports: [
    SyncService,
    TmsSyncService,
    EldSyncService,
    EldDataCacheService,
    DriverMatcher,
    DriverMerger,
    TrailerMatcher,
    TrailerMerger,
    VehicleMatcher,
    VehicleMerger,
  ],
})
export class SyncModule {}
