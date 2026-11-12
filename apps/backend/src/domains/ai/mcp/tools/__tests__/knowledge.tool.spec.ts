import { KnowledgeTool } from '../knowledge.tool';
import { CITATIONS_SIDE_CHANNEL } from '../../turn-evidence';
import { KnowledgeBaseService } from '../../../knowledge-base/knowledge-base.service';

describe('KnowledgeTool', () => {
  let tool: KnowledgeTool;
  let mockKbService: any;

  beforeEach(() => {
    mockKbService = {
      hybridSearch: jest.fn().mockResolvedValue([
        {
          documentId: 'doc_001',
          title: 'Audit Log',
          content: 'The platform optimizes your workflows...',
          documentType: 'feature',
          audience: 'prospect',
          category: 'route_planning',
          keywords: ['route'],
          similarity: 0.89,
        },
        {
          documentId: 'doc_002',
          title: 'HOS Compliance',
          content: 'The platform keeps you compliant...',
          documentType: 'faq',
          audience: 'prospect',
          category: 'hos_compliance',
          keywords: ['hos'],
          similarity: 0.82,
        },
      ]),
      getByCategory: jest.fn().mockResolvedValue([
        {
          documentId: 'doc_003',
          title: 'Pricing Tiers',
          content: 'The platform offers three pricing tiers...',
          documentType: 'pricing',
          category: 'pricing',
          keywords: ['pricing'],
        },
      ]),
    };

    tool = new KnowledgeTool(mockKbService);
  });

  describe('searchKB', () => {
    it('should search knowledge base and return formatted results', async () => {
      const result = await tool.searchKB({
        query: 'How does the audit log work?',
        audience: 'prospect',
      });

      expect(mockKbService.hybridSearch).toHaveBeenCalledWith(
        'How does the audit log work?',
        expect.objectContaining({ audience: 'prospect', limit: 5 }),
      );
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe('Audit Log');
      expect(result.results[0].relevance).toBe(0.89);
    });

    it('embeds the query for the calling tenant, from the server-injected _tenantId', async () => {
      await tool.searchKB({ query: 'pricing', audience: 'all', _tenantId: 42 });

      expect(mockKbService.hybridSearch).toHaveBeenCalledWith(
        'pricing',
        expect.objectContaining({ aiContext: { tenantId: 42, surface: 'EMBEDDING' } }),
      );
    });

    it('passes no routing context without a tenant, so the search is full-text', async () => {
      await tool.searchKB({ query: 'pricing', audience: 'all' });

      expect(mockKbService.hybridSearch.mock.calls[0][1].aiContext).toBeUndefined();
    });

    it('should pass optional filters through', async () => {
      await tool.searchKB({
        query: 'pricing',
        audience: 'prospect',
        category: 'pricing',
        limit: 3,
      });

      expect(mockKbService.hybridSearch).toHaveBeenCalledWith(
        'pricing',
        expect.objectContaining({
          audience: 'prospect',
          category: 'pricing',
          limit: 3,
        }),
      );
    });
  });

  describe('citations', () => {
    it('offers one knowledge-base citation per document a search returned, never shown to the model as data', async () => {
      mockKbService.hybridSearch.mockResolvedValue([
        { documentId: 'kb_1_0', parentDocId: 'kb_1', title: 'Getting started', content: 'a', similarity: 0.9 },
        { documentId: 'kb_1_1', parentDocId: 'kb_1', title: 'Getting started', content: 'b', similarity: 0.8 },
        { documentId: 'kb_2', parentDocId: null, title: 'Inviting teammates', content: 'c', similarity: 0.7 },
      ]);

      const result = await tool.searchKB({ query: 'start', audience: 'all' });

      expect(result[CITATIONS_SIDE_CHANNEL]).toEqual([
        { sourceType: 'KNOWLEDGE_DOCUMENT', sourceId: 'kb_1', title: 'Getting started' },
        { sourceType: 'KNOWLEDGE_DOCUMENT', sourceId: 'kb_2', title: 'Inviting teammates' },
      ]);
    });

    it('offers citations for the documents of a topic too', async () => {
      const result = await tool.getProductInfo({ topic: 'pricing', audience: 'all' });

      expect(result[CITATIONS_SIDE_CHANNEL]).toEqual([
        { sourceType: 'KNOWLEDGE_DOCUMENT', sourceId: 'doc_003', title: 'Pricing Tiers' },
      ]);
    });
  });

  describe('getProductInfo', () => {
    it('should return documents for a given topic/category', async () => {
      const result = await tool.getProductInfo({
        topic: 'pricing',
        audience: 'prospect',
      });

      expect(mockKbService.getByCategory).toHaveBeenCalledWith('pricing', 'prospect');
      expect(result.documents).toHaveLength(1);
      expect(result.topic).toBe('pricing');
    });
  });
});
