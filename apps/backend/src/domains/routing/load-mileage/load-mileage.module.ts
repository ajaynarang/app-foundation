import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { MileageModule } from '../../platform-services/mileage/mileage.module';
import { LoadMileageJobHandler } from './load-mileage.processor';
import { LoadMileageService } from './load-mileage.service';

@Module({
  imports: [PrismaModule, MileageModule, QueueModule],
  providers: [LoadMileageService, LoadMileageJobHandler],
  exports: [LoadMileageService, LoadMileageJobHandler],
})
export class LoadMileageModule {}
