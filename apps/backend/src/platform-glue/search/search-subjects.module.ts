import { Module } from '@nestjs/common';
import { SEARCH_SUBJECTS, type SearchSubject } from '../../domains/ai/search-index/search-subject';

/**
 * YOUR searchable records: the kinds of tenant record the search index covers, like the event registry.
 *
 * Each kind is a provider that implements `SearchSubject` (`domains/ai/search-index/search-subject.ts`): which events change
 * it, how to read one record as text, and how to list them all for a rebuild. Import the module that provides it,
 * and return it from the factory:
 *
 *   @Module({
 *     imports: [OrdersModule],
 *     providers: [
 *       {
 *         provide: SEARCH_SUBJECTS,
 *         useFactory: (orders: OrderSearchSubject): SearchSubject[] => [orders],
 *         inject: [OrderSearchSubject],
 *       },
 *     ],
 *     exports: [SEARCH_SUBJECTS],
 *   })
 *
 * The starter registers none: the index stays empty, the assistant's record search finds nothing, and no event is
 * listened for. After adding a subject to a product with data, run `pnpm search:rebuild`.
 */
@Module({
  providers: [{ provide: SEARCH_SUBJECTS, useFactory: (): SearchSubject[] => [] }],
  exports: [SEARCH_SUBJECTS],
})
export class SearchSubjectsModule {}
