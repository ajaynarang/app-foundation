import { Controller, Get, Inject, Logger, Optional, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SEARCH_PROVIDERS, SearchProvider, SearchResult } from './search.provider';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { SearchResultsResponse } from './openapi.responses';

@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(
    @Optional()
    @Inject(SEARCH_PROVIDERS)
    private readonly providers: SearchProvider[] | null,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Tenant-scoped entity search (command palette / @-mentions)' })
  @ApiResult(SearchResultsResponse)
  async search(@CurrentUser() user: any, @Query() params: SearchQueryDto): Promise<{ results: SearchResult[] }> {
    const query = params.q ?? '';
    if (query.length < 2) {
      return { results: [] };
    }

    const providers = this.providers ?? [];
    if (providers.length === 0) {
      return { results: [] };
    }

    const settled = await Promise.allSettled(providers.map((p) => p.search(user.tenantDbId, query)));

    const results: SearchResult[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
      } else {
        this.logger.warn(`Search provider failed: ${outcome.reason?.message ?? outcome.reason}`);
      }
    }

    return { results: results.slice(0, params.limit) };
  }
}
