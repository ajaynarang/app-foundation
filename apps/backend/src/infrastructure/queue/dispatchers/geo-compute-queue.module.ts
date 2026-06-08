import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { RoutePlanningModule } from '../../../domains/routing/route-planning/route-planning.module';
import { LoadMileageModule } from '../../../domains/routing/load-mileage/load-mileage.module';
import { RoutePlanProgressJobHandler } from '../../../domains/routing/route-planning/jobs/route-plan-progress.processor';
import { LoadMileageJobHandler } from '../../../domains/routing/load-mileage/load-mileage.processor';
import { GeoComputeQueueProcessor } from './geo-compute-queue.processor';

/**
 * Wires the single `geo-compute` queue dispatcher. Imports the modules that
 * export the two handler classes and assembles them into the queue's
 * handler-array token via an explicit factory.
 */
@Module({
  imports: [QueueModule, forwardRef(() => RoutePlanningModule), forwardRef(() => LoadMileageModule)],
  providers: [
    GeoComputeQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.GEO_COMPUTE),
      useFactory: (progress: RoutePlanProgressJobHandler, mileage: LoadMileageJobHandler): QueueJobHandler[] => [
        progress,
        mileage,
      ],
      inject: [RoutePlanProgressJobHandler, LoadMileageJobHandler],
    },
  ],
})
export class GeoComputeQueueModule {}
