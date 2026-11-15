import { Module } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { SearchIndexModule } from '../../../domains/ai/search-index/search-index.module';
import { SearchIndexJobHandler } from '../../../domains/ai/search-index/indexing/search-index.handler';
import { AiBackgroundQueueProcessor } from './ai-background-queue.processor';

/**
 * Wires the single `ai-background` queue dispatcher. Imports the modules that export the handler classes and
 * assembles them into the queue's handler-array token via an explicit factory. Register additional background AI
 * handlers here.
 */
@Module({
  imports: [QueueModule, SearchIndexModule],
  providers: [
    AiBackgroundQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.AI_BACKGROUND),
      useFactory: (searchIndex: SearchIndexJobHandler): QueueJobHandler[] => [searchIndex],
      inject: [SearchIndexJobHandler],
    },
  ],
})
export class AiBackgroundQueueModule {}
