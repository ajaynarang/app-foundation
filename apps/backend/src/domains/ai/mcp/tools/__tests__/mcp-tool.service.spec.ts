import { z } from 'zod';
import { McpToolService } from '../../mcp-tool.service';

/**
 * McpToolService unit tests.
 *
 * The service uses McpRegistryService to discover tools and ModuleRef to
 * resolve provider instances. We mock the registry, moduleRef, and AiPrismaService
 * to test tool exposure, context injection, and RLS wrapping in isolation.
 */
describe('McpToolService', () => {
  let mockRegistry: any;
  let mockModuleRef: any;
  let mockAiPrisma: any;
  let mockHealthInstance: any;
  let mockKbInstance: any;
  let mockItemsInstance: any;

  function makeTool(
    name: string,
    description: string,
    parameters: z.ZodType,
    methodName: string,
    providerClass: symbol,
  ) {
    return {
      type: 'tool',
      metadata: { name, description, parameters },
      providerClass,
      methodName,
    };
  }

  const healthSymbol = Symbol('HealthTool');
  const kbSymbol = Symbol('KnowledgeTool');
  const itemsSymbol = Symbol('ItemsTool');

  beforeEach(() => {
    mockHealthInstance = {
      check: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    mockKbInstance = {
      searchKB: jest.fn().mockResolvedValue({ results: [] }),
      getProductInfo: jest.fn().mockResolvedValue({ documents: [] }),
    };
    mockItemsInstance = {
      queryItems: jest.fn().mockResolvedValue({ items: [1, 2, 3] }),
    };

    const tools = [
      makeTool('health-check', 'Check health', z.object({}), 'check', healthSymbol),
      makeTool('search-kb', 'Search KB', z.object({ query: z.string() }), 'searchKB', kbSymbol),
      makeTool('get-product-info', 'Get info', z.object({ topic: z.string() }), 'getProductInfo', kbSymbol),
      makeTool('query-items', 'Query items', z.object({}), 'queryItems', itemsSymbol),
    ];

    mockRegistry = {
      getMcpModuleIds: jest.fn().mockReturnValue(['test-module']),
      getTools: jest.fn().mockReturnValue(tools),
    };

    mockModuleRef = {
      get: jest.fn().mockImplementation((token: any) => {
        if (token === healthSymbol) return mockHealthInstance;
        if (token === kbSymbol) return mockKbInstance;
        if (token === itemsSymbol) return mockItemsInstance;
        return null;
      }),
    };

    mockAiPrisma = {
      executeWithRlsContext: jest.fn((tenantId, userId, role, fn) => fn()),
    };
  });

  function createService(): McpToolService {
    const service = new McpToolService(mockRegistry, mockModuleRef, mockAiPrisma);
    return service;
  }

  describe('getToolsForPersona', () => {
    it('should expose every discovered tool to all personas (no per-persona allowlist in the starter)', async () => {
      const service = createService();
      await service.onModuleInit();

      for (const persona of ['member', 'admin']) {
        const tools = await service.getToolsForPersona(persona);
        const toolNames = Object.keys(tools);
        expect(toolNames).toContain('health-check');
        expect(toolNames).toContain('search-kb');
        expect(toolNames).toContain('get-product-info');
        expect(toolNames).toContain('query-items');
        expect(toolNames).toHaveLength(4);
      }
    });

    it('should return tools with execute functions', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('member');

      expect(tools['health-check']).toBeDefined();
      expect(tools['health-check'].execute).toBeInstanceOf(Function);
    });

    it('should call provider method when tool is executed without context', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('member');

      const result = await (tools['health-check'] as any).execute({});

      expect(mockHealthInstance.check).toHaveBeenCalledWith({});
      expect(result).toEqual({ status: 'ok' });
    });

    it('should inject tenant context into tool arguments', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', {
        tenantId: 1,
        userId: '10',
        userDbId: 10,
      });

      await (tools['health-check'] as any).execute({ foo: 'bar' });

      expect(mockHealthInstance.check).toHaveBeenCalledWith({
        foo: 'bar',
        _tenantId: 1,
        _userId: '10',
      });
    });

    it('should wrap tool execution with RLS context when context is provided', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', {
        tenantId: 1,
        userId: '10',
        userDbId: 10,
      });

      await (tools['health-check'] as any).execute({});

      expect(mockAiPrisma.executeWithRlsContext).toHaveBeenCalledWith(
        1, // tenantId
        10, // userDbId
        'admin', // role = userMode
        expect.any(Function),
      );
    });

    it('should NOT wrap with RLS when no context is provided', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('member');

      await (tools['health-check'] as any).execute({});

      expect(mockAiPrisma.executeWithRlsContext).not.toHaveBeenCalled();
    });

    it('should unwrap MCP content format from tool results', async () => {
      mockItemsInstance.queryItems.mockResolvedValue({
        content: [{ type: 'text', text: '{"items": [1, 2, 3]}' }],
      });

      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', {
        tenantId: 1,
        userId: '1',
        userDbId: 1,
      });
      const result = await (tools['query-items'] as any).execute({});

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('should return raw result when not MCP content format', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('member');
      const result = await (tools['health-check'] as any).execute({});

      expect(result).toEqual({ status: 'ok' });
    });

    it('should capture card metadata via CardAccumulator', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CardAccumulator } = require('../../mcp-tool.service');

      mockItemsInstance.queryItems.mockResolvedValue({
        content: [{ type: 'text', text: '{"items": [1]}' }],
        _card: { type: 'item_list', data: { items: [1] } },
      });

      const accumulator = new CardAccumulator();
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', { tenantId: 1, userId: '1', userDbId: 1 }, accumulator);

      await (tools['query-items'] as any).execute({});

      expect(accumulator.card).toEqual({
        type: 'item_list',
        data: { items: [1] },
      });
    });

    it('should return null card when nothing captured', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CardAccumulator } = require('../../mcp-tool.service');
      const accumulator = new CardAccumulator();
      expect(accumulator.card).toBeNull();
    });

    it('should re-discover tools if allTools is empty', async () => {
      const service = createService();
      // Don't call onModuleInit — allTools will be empty
      const tools = await service.getToolsForPersona('member');
      // discoverTools should have been called automatically
      expect(Object.keys(tools).length).toBeGreaterThan(0);
    });

    it('should handle MCP text content that is not valid JSON', async () => {
      mockItemsInstance.queryItems.mockResolvedValue({
        content: [{ type: 'text', text: 'not-json' }],
      });

      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', {
        tenantId: 1,
        userId: '1',
        userDbId: 1,
      });
      const result = await (tools['query-items'] as any).execute({});

      // Should return raw text when JSON parse fails
      expect(result).toBe('not-json');
    });

    it('should inject conversationId when provided in context', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', {
        tenantId: 1,
        userId: '10',
        userDbId: 10,
        conversationId: 'conv_123',
      });

      await (tools['health-check'] as any).execute({ foo: 'bar' });

      expect(mockHealthInstance.check).toHaveBeenCalledWith({
        foo: 'bar',
        _tenantId: 1,
        _userId: '10',
        _conversationId: 'conv_123',
      });
    });
  });

  describe('getToolsetsForPersona', () => {
    it('should return toolsets object with app-tools key', async () => {
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('member');
      expect(toolsets).toHaveProperty('app-tools');
      expect(toolsets['app-tools']).toBeDefined();
    });

    it('should NOT include confirm-action while WRITE_TOOLS is empty (starter default)', async () => {
      // The starter ships no write-class tools. Register write tool names in
      // McpToolService.WRITE_TOOLS to have confirm-action injected for HITL.
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('admin', {
        tenantId: 1,
        userId: '1',
        userDbId: 1,
      });
      expect(toolsets['app-tools']).not.toHaveProperty('confirm-action');
    });

    it('should pass cardAccumulator through to getToolsForPersona', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CardAccumulator } = require('../../mcp-tool.service');
      const accumulator = new CardAccumulator();
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('member', undefined, accumulator);
      expect(toolsets['app-tools']).toBeDefined();
    });
  });
});
