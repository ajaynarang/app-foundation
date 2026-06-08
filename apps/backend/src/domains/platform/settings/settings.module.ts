import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';

// Super Admin preferences (platform-level)
import { SuperAdminPreferencesController } from './super-admin-preferences.controller';
import { SuperAdminPreferencesService } from './super-admin-preferences.service';

// User preferences (per-user display/notification settings)
import { UserPreferencesController } from './user-preferences.controller';
import { UserPreferencesService } from './user-preferences.service';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [SuperAdminPreferencesController, UserPreferencesController],
  providers: [SuperAdminPreferencesService, UserPreferencesService],
  exports: [SuperAdminPreferencesService, UserPreferencesService],
})
export class SettingsModule {}
