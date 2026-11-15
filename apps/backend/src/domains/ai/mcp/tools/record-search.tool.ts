import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { SearchQueryService } from '../../search-index/query/search-query.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/** Server-injected identity, set by the tool pipeline's executor (it drops any `_` key the caller sent). */
interface CallerArgs {
  _tenantId?: number;
}

@Injectable()
export class RecordSearchTool {
  constructor(private readonly search: SearchQueryService) {}

  @RequiresScope('platform:read')
  @Tool({
    name: 'search-records',
    description:
      "Search this workspace's own records by meaning and by keyword. Use it when the question is about the workspace's data, not about how the product works (that is search-kb). Returns the most relevant passages with the record each came from. Name the record's title when your answer uses a result. An empty result means nothing indexed matches; it does not mean the record does not exist.",
    parameters: z.object({
      query: z.string().min(1).max(500).describe("What to look for, in the user's own words"),
      types: z.array(z.string().max(50)).max(10).optional().describe('Optional record types to search within'),
      limit: z.number().int().min(1).max(10).default(5).describe('Max passages to return'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async searchRecords(params: { query: string; types?: string[]; limit?: number } & CallerArgs) {
    if (!params._tenantId) return { results: [], totalResults: 0 };
    const hits = await this.search.retrieve(params._tenantId, params.query, {
      types: params.types,
      limit: params.limit ?? 5,
    });
    return {
      results: hits.map((h) => ({
        type: h.subjectType,
        id: h.subjectId,
        title: h.title,
        section: h.section,
        content: h.content,
        href: h.href,
        relevance: h.score,
      })),
      totalResults: hits.length,
    };
  }
}
