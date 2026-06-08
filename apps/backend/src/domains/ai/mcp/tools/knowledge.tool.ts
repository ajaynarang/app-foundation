import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

@Injectable()
export class KnowledgeTool {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @RequiresScope('documents:read')
  @Tool({
    name: 'search-kb',
    description:
      'Search the SALLY knowledge base for product features, capabilities, pricing, and how-to guides. Use this to answer questions about what SALLY does, how features work, or how to use the platform. Returns the most relevant content chunks ranked by relevance.',
    parameters: z.object({
      query: z.string().describe('The search query — what the prospect is asking about'),
      audience: z
        .enum(['prospect', 'dispatcher', 'driver', 'all'])
        .default('prospect')
        .describe('Filter results by target audience'),
      category: z
        .string()
        .optional()
        .describe(
          'Optional category filter: route_planning, hos_compliance, alerts, integrations, fuel_optimization, pricing, security, driver_experience, dispatcher_experience, monitoring, general',
        ),
      limit: z.number().min(1).max(10).default(5).describe('Max results to return'),
    }),
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  })
  async searchKB(params: { query: string; audience: string; category?: string; limit?: number }) {
    const results = await this.knowledgeBaseService.hybridSearch(params.query, {
      audience: params.audience,
      category: params.category,
      limit: params.limit ?? 5,
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

  @RequiresScope('documents:read')
  @Tool({
    name: 'get-product-info',
    description:
      'Get structured product information by topic. Use this when a user asks about a specific feature category (e.g., "tell me about pricing", "how does route planning work?", "how do I manage loads?"). Returns all knowledge documents for that topic.',
    parameters: z.object({
      topic: z
        .enum([
          // Prospect KB categories
          'route_planning',
          'hos_compliance',
          'alerts',
          'integrations',
          'fuel_optimization',
          'pricing',
          'security',
          'driver_experience',
          'dispatcher_experience',
          'monitoring',
          'general',
          'onboarding',
          'analytics',
          'support',
          'comparison',
          'roi',
          'dynamic_updates',
          // Product manual categories
          'getting_started',
          'dispatcher',
          'driver',
          'admin',
          'customer',
          'console',
          'sally_ai',
          'reference',
        ])
        .describe('The product topic to retrieve information about'),
      audience: z
        .enum(['prospect', 'dispatcher', 'driver', 'all'])
        .default('prospect')
        .describe('Filter by target audience'),
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
