import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { AccountingModule } from '../../../domains/integrations/accounting/accounting.module';
import { PlansModule } from '../../../domains/platform/plans/plans.module';
import { AddOnsModule } from '../../../domains/platform/add-ons/add-ons.module';
import { AccountingSyncJobHandler } from '../../../domains/integrations/accounting/processors/accounting-sync-job.handler';
import { TrialExpiryService } from '../../../domains/platform/plans/trial-expiry.service';
import { AddOnUsageResetService } from '../../../domains/platform/add-ons/add-on-usage-reset.service';
import { FinanceQueueProcessor } from './finance-queue.processor';

/**
 * Wires the single `finance` queue dispatcher. Imports the modules that export
 * the three handler classes and assembles them into the queue's handler-array
 * token via an explicit factory.
 */
@Module({
  imports: [
    QueueModule,
    forwardRef(() => AccountingModule),
    forwardRef(() => PlansModule),
    forwardRef(() => AddOnsModule),
  ],
  providers: [
    FinanceQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.FINANCE),
      useFactory: (
        accounting: AccountingSyncJobHandler,
        trial: TrialExpiryService,
        addon: AddOnUsageResetService,
      ): QueueJobHandler[] => [accounting, trial, addon],
      inject: [AccountingSyncJobHandler, TrialExpiryService, AddOnUsageResetService],
    },
  ],
})
export class FinanceQueueModule {}
