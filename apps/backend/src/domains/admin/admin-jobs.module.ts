import { Module } from '@nestjs/common';
import { AdminJobsController } from './admin-jobs.controller';
import { AdminSchedulesController } from './admin-schedules.controller';
import { AdminCacheController } from './admin-cache.controller';
import { JobService } from '../../infrastructure/queue/job.service';
import { ScheduleManagerService } from '../../infrastructure/queue/schedule-manager.service';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { CacheModule } from '../../infrastructure/cache/cache.module';

@Module({
  imports: [QueueModule, PrismaModule, CacheModule],
  controllers: [AdminJobsController, AdminSchedulesController, AdminCacheController],
  providers: [JobService, ScheduleManagerService],
})
export class AdminJobsModule {}
