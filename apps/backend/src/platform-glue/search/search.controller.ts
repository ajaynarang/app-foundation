import { Controller, Get, Inject, Logger, Optional, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@appshore/db';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { SEARCH_PROVIDERS, SearchProvider, SearchResult } from './search.provider';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

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
  @ApiQuery({ name: 'q', required: true, description: 'Search query (min 2 characters)' })
  @ApiQuery({ name: 'limit', required: false, description: `Max results (default ${DEFAULT_LIMIT})` })
  async search(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<{ results: SearchResult[] }> {
    const query = q?.trim() ?? '';
    if (query.length < 2) {
      return { results: [] };
    }

    const providers = this.providers ?? [];
    if (providers.length === 0) {
      return { results: [] };
    }

    const max = Math.min(Math.max(parseInt(limit ?? '', 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const settled = await Promise.allSettled(providers.map((p) => p.search(user.tenantDbId, query)));

    const results: SearchResult[] = [];
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value);
      } else {
        this.logger.warn(`Search provider failed: ${outcome.reason?.message ?? outcome.reason}`);
      }
    }

    return { results: results.slice(0, max) };
  }
}
