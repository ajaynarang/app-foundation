import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';

// Super Admin preferences (platform-level)
import { SuperAdminPreferencesController } from './super-admin-preferences.controller';
import { SuperAdminPreferencesService } from './super-admin-preferences.service';

// User preferences (per-user display/notification settings)
import { UserPreferencesController } from './user-preferences.controller';
import { UserPreferencesService } from './user-preferences.service';

// Operations settings (per-tenant fleet configuration)
import { OperationsSettingsController } from './operations-settings.controller';
import { OperationsSettingsService } from './operations-settings.service';

// Alert configuration (per-tenant alert thresholds, escalation, channels)
import { AlertConfigController } from './alert-config.controller';
import { AlertConfigService } from './alert-config.service';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [
    SuperAdminPreferencesController,
    UserPreferencesController,
    OperationsSettingsController,
    AlertConfigController,
  ],
  providers: [SuperAdminPreferencesService, UserPreferencesService, OperationsSettingsService, AlertConfigService],
  exports: [SuperAdminPreferencesService, UserPreferencesService, OperationsSettingsService, AlertConfigService],
})
export class SettingsModule {}
