import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { DocumentIntelligenceModule } from '../../../domains/ai/document-intelligence/document-intelligence.module';
import { EmailIntakeModule } from '../../../domains/integrations/email-intake/email-intake.module';
import { RateconJobHandler } from '../../../domains/ai/document-intelligence/ratecon/ratecon-job.handler';
import { EmailIntakeJobHandler } from '../../../domains/integrations/email-intake/processors/email-intake-job.handler';
import { DocumentsQueueProcessor } from './documents-queue.processor';

/**
 * Wires the single `documents` queue dispatcher. Imports the two domains that
 * own job names on the queue (each exports its handler class) and assembles them
 * into the queue's handler-array token via an explicit factory.
 *
 * Assembly is explicit here — NOT cross-module `multi: true` aggregation, which
 * does not merge sibling-module contributions into one array (see
 * `job-handler-aggregation.spec.ts`). Lives in infrastructure because it spans
 * domains and the dispatcher is a queue-infrastructure concern.
 */
@Module({
  imports: [QueueModule, forwardRef(() => DocumentIntelligenceModule), forwardRef(() => EmailIntakeModule)],
  providers: [
    DocumentsQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.DOCUMENTS),
      useFactory: (ratecon: RateconJobHandler, email: EmailIntakeJobHandler): QueueJobHandler[] => [ratecon, email],
      inject: [RateconJobHandler, EmailIntakeJobHandler],
    },
  ],
})
export class DocumentsQueueModule {}
