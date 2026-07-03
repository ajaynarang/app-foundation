import { DynamicModule, Module, ModuleMetadata, Provider } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SEARCH_PROVIDERS } from './search.provider';

/**
 * Entity search endpoint (`GET /search`).
 *
 * Default registration ships no providers — the endpoint returns
 * `{ results: [] }`. To plug in your domain searchers, swap the import in
 * `app.module.ts` for:
 *
 * ```ts
 * SearchModule.register({
 *   imports: [MyDomainModule],
 *   providers: [
 *     {
 *       provide: SEARCH_PROVIDERS,
 *       useFactory: (customers: CustomerSearchService, orders: OrderSearchService) => [customers, orders],
 *       inject: [CustomerSearchService, OrderSearchService],
 *     },
 *   ],
 * })
 * ```
 *
 * Each factory-returned object implements `SearchProvider`; the controller
 * concatenates results across providers.
 */
@Module({
  controllers: [SearchController],
  providers: [{ provide: SEARCH_PROVIDERS, useValue: [] }],
})
export class SearchModule {
  static register(options: Pick<ModuleMetadata, 'imports'> & { providers: Provider[] }): DynamicModule {
    return {
      module: SearchModule,
      imports: options.imports ?? [],
      // Appended after the static default SEARCH_PROVIDERS, so the app's
      // registration wins.
      providers: options.providers,
    };
  }
}
