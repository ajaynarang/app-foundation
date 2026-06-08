import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { LoginActivityService } from './login-activity.service';
import { LoginActivityController } from './login-activity.controller';
import { LoginActivityAdminController } from './login-activity-admin.controller';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [LoginActivityController, LoginActivityAdminController],
  providers: [LoginActivityService],
  exports: [LoginActivityService],
})
export class LoginActivityModule {}
