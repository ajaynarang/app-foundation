import { Module } from '@nestjs/common';
import { AdminJobsController } from './admin-jobs.controller';
import { AdminSchedulesController } from './admin-schedules.controller';
import { AdminCacheController } from './admin-cache.controller';
import { JobService } from '@appshore/platform/infrastructure/queue/job.service';
import { ScheduleManagerService } from '@appshore/platform/infrastructure/queue/schedule-manager.service';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { QueueModule } from '../../platform-glue/queue/queue.module';
import { CacheModule } from '../../platform-glue/cache/cache.module';

@Module({
  imports: [QueueModule, PrismaModule, CacheModule],
  controllers: [AdminJobsController, AdminSchedulesController, AdminCacheController],
  providers: [JobService, ScheduleManagerService],
})
export class AdminJobsModule {}
