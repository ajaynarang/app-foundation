import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { AiInfrastructureModule } from '../infrastructure/ai-infrastructure.module';
import { QueueModule } from '../../../platform-glue/queue/queue.module';
import { SearchSubjectsModule } from '../../../platform-glue/search/search-subjects.module';
import { SearchIndexerService } from './indexing/search-indexer.service';
import { SearchIndexListener } from './indexing/search-index.listener';
import { SearchIndexJobHandler } from './indexing/search-index.handler';
import { SearchQueryService } from './query/search-query.service';
import { SearchRebuildService } from './rebuild/search-rebuild.service';
import { SEARCH_SUBJECTS, assertSubjects, type SearchSubject } from './search-subject';

/**
 * The search index over tenant records: a derived table (`search_chunks`) that follows the records through their
 * domain events. What is indexed is the product's list in `platform-glue/search/search-subjects.module.ts`; with no
 * subject registered nothing is written and nothing listens.
 */
@Module({
  imports: [PrismaModule, AiInfrastructureModule, QueueModule, SearchSubjectsModule],
  providers: [
    SearchIndexerService,
    SearchIndexListener,
    SearchIndexJobHandler,
    SearchQueryService,
    SearchRebuildService,
  ],
  exports: [
    SearchIndexerService,
    SearchIndexJobHandler,
    SearchQueryService,
    SearchRebuildService,
    SearchSubjectsModule,
  ],
})
export class SearchIndexModule implements OnModuleInit {
  constructor(@Inject(SEARCH_SUBJECTS) private readonly subjects: readonly SearchSubject[]) {}

  onModuleInit(): void {
    assertSubjects(this.subjects);
  }
}
