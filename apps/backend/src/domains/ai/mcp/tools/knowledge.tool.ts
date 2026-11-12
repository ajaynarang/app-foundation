import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { AiSurface } from '@appshore/db';
import { CITATION_SOURCE_KNOWLEDGE_DOCUMENT, type Citation } from '@app/shared-types';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { kbAudiencesFor, kbRoleFromToolArgs } from '../../knowledge-base/kb-audience';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { CITATIONS_SIDE_CHANNEL } from '../turn-evidence';

/**
 * The citation candidates for knowledge-base rows: one per document (a chunk names its parent), so two chunks of one
 * guide are one source. The knowledge base has no page in the web app, so a citation carries no `href`.
 */
export function knowledgeCitations(
  rows: { documentId: string; parentDocId?: string | null; title: string }[],
): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const row of rows) {
    const sourceId = row.parentDocId ?? row.documentId;
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    citations.push({ sourceType: CITATION_SOURCE_KNOWLEDGE_DOCUMENT, sourceId, title: row.title });
  }
  return citations;
}

/**
 * Server-injected identity: `_tenantId` by the tool runner; `_role` once the tool pipeline injects it. Until then a
 * `_role` is not trusted (see kb-audience.ts), which is harmless only while `ROLE_AUDIENCE` is empty.
 */
interface CallerArgs {
  _tenantId?: number;
  _role?: string;
}

@Injectable()
export class KnowledgeTool {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @RequiresScope('knowledge:read')
  @Tool({
    name: 'search-kb',
    description:
      'Search the knowledge base for product features, how-to guides, and reference content. Use this to answer questions about what the platform does or how to use it. Returns the most relevant content chunks ranked by relevance. When your answer uses a result, name its title so the reader sees the source.',
    parameters: z.object({
      query: z.string().describe("The search query, in the user's own words"),
      category: z.string().optional().describe('Optional category filter'),
      limit: z.number().min(1).max(10).default(5).describe('Max results to return'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async searchKB(params: { query: string; category?: string; limit?: number } & CallerArgs) {
    // The audience is the server's call, not the model's (kb-audience.ts). The query is embedded on the calling
    // tenant's route; without a tenant the search is full-text alone.
    const results = await this.knowledgeBaseService.hybridSearch(params.query, {
      audiences: kbAudiencesFor(kbRoleFromToolArgs(params)),
      category: params.category,
      limit: params.limit ?? 5,
      aiContext: params._tenantId ? { tenantId: params._tenantId, surface: AiSurface.EMBEDDING } : undefined,
    });

    return {
      results: results.map((r) => ({
        title: r.title,
        section: r.section,
        content: r.content,
        category: r.category,
        type: r.documentType,
        relevance: r.similarity,
      })),
      totalResults: results.length,
      [CITATIONS_SIDE_CHANNEL]: knowledgeCitations(results),
    };
  }

  @RequiresScope('knowledge:read')
  @Tool({
    name: 'get-product-info',
    description:
      'Get structured product information by topic. Use this when a user asks about a specific feature category (e.g., "tell me about pricing", "how does X work?"). Returns all knowledge documents for that topic.',
    parameters: z.object({
      topic: z.string().describe('The product topic / category to retrieve information about'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async getProductInfo(params: { topic: string } & CallerArgs) {
    const documents = await this.knowledgeBaseService.getByCategory(
      params.topic,
      kbAudiencesFor(kbRoleFromToolArgs(params)),
    );

    return {
      topic: params.topic,
      documents: documents.map((d) => ({
        title: d.title,
        section: d.section,
        content: d.content,
        category: d.category,
        type: d.documentType,
      })),
      totalDocuments: documents.length,
      [CITATIONS_SIDE_CHANNEL]: knowledgeCitations(documents),
    };
  }
}
