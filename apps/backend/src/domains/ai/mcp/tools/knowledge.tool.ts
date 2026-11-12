import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { AiSurface } from '@appshore/db';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

@Injectable()
export class KnowledgeTool {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @RequiresScope('knowledge:read')
  @Tool({
    name: 'search-kb',
    description:
      'Search the knowledge base for product features, how-to guides, and reference content. Use this to answer questions about what the platform does or how to use it. Returns the most relevant content chunks ranked by relevance.',
    parameters: z.object({
      query: z.string().describe('The search query — what the user is asking about'),
      audience: z.enum(['user', 'all']).default('all').describe('Filter results by target audience'),
      category: z.string().optional().describe('Optional category filter'),
      limit: z.number().min(1).max(10).default(5).describe('Max results to return'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async searchKB(params: { query: string; audience: string; category?: string; limit?: number; _tenantId?: number }) {
    // The query is embedded on the calling tenant's route (`_tenantId` is injected by the server, never the model).
    // Without a tenant the search is full-text alone.
    const results = await this.knowledgeBaseService.hybridSearch(params.query, {
      audience: params.audience,
      category: params.category,
      limit: params.limit ?? 5,
      aiContext: params._tenantId ? { tenantId: params._tenantId, surface: AiSurface.EMBEDDING } : undefined,
    });

    return {
      results: results.map((r) => ({
        title: r.title,
        content: r.content,
        category: r.category,
        type: r.documentType,
        relevance: r.similarity,
      })),
      totalResults: results.length,
    };
  }

  @RequiresScope('knowledge:read')
  @Tool({
    name: 'get-product-info',
    description:
      'Get structured product information by topic. Use this when a user asks about a specific feature category (e.g., "tell me about pricing", "how does X work?"). Returns all knowledge documents for that topic.',
    parameters: z.object({
      topic: z.string().describe('The product topic / category to retrieve information about'),
      audience: z.enum(['user', 'all']).default('all').describe('Filter by target audience'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async getProductInfo(params: { topic: string; audience: string }) {
    const documents = await this.knowledgeBaseService.getByCategory(params.topic, params.audience);

    return {
      topic: params.topic,
      documents: documents.map((d) => ({
        title: d.title,
        content: d.content,
        category: d.category,
        type: d.documentType,
      })),
      totalDocuments: documents.length,
    };
  }
}
