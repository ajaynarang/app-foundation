import { z } from 'zod';
import { McpToolService } from '../../mcp-tool.service';

/**
 * McpToolService unit tests.
 *
 * The service uses McpRegistryService to discover tools and ModuleRef to
 * resolve provider instances. We mock the registry, moduleRef, and AiPrismaService
 * to test persona filtering, context injection, and RLS wrapping in isolation.
 */
describe('McpToolService', () => {
  let mockRegistry: any;
  let mockModuleRef: any;
  let mockAiPrisma: any;
  let mockHealthInstance: any;
  let mockKbInstance: any;
  let mockLeadInstance: any;
  let mockFleetInstance: any;

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
  const leadSymbol = Symbol('LeadCaptureTool');
  const fleetSymbol = Symbol('FleetQueryTool');

  beforeEach(() => {
    mockHealthInstance = {
      check: jest.fn().mockResolvedValue({ status: 'ok' }),
    };
    mockKbInstance = {
      searchKB: jest.fn().mockResolvedValue({ results: [] }),
      getProductInfo: jest.fn().mockResolvedValue({ documents: [] }),
    };
    mockLeadInstance = {
      requestDemo: jest.fn().mockResolvedValue({ success: true }),
      getPricing: jest.fn().mockResolvedValue({ tiers: [] }),
    };
    mockFleetInstance = {
      queryLoads: jest.fn().mockResolvedValue({ loads: [1, 2, 3] }),
    };

    const tools = [
      makeTool('health-check', 'Check health', z.object({}), 'check', healthSymbol),
      makeTool('search-kb', 'Search KB', z.object({ query: z.string() }), 'searchKB', kbSymbol),
      makeTool('get-product-info', 'Get info', z.object({ topic: z.string() }), 'getProductInfo', kbSymbol),
      makeTool('request-demo', 'Request demo', z.object({ name: z.string() }), 'requestDemo', leadSymbol),
      makeTool('get-pricing', 'Get pricing', z.object({}), 'getPricing', leadSymbol),
      makeTool('query-loads', 'Query loads', z.object({}), 'queryLoads', fleetSymbol),
    ];

    mockRegistry = {
      getMcpModuleIds: jest.fn().mockReturnValue(['test-module']),
      getTools: jest.fn().mockReturnValue(tools),
    };

    mockModuleRef = {
      get: jest.fn().mockImplementation((token: any) => {
        if (token === healthSymbol) return mockHealthInstance;
        if (token === kbSymbol) return mockKbInstance;
        if (token === leadSymbol) return mockLeadInstance;
        if (token === fleetSymbol) return mockFleetInstance;
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
    it('should filter tools by persona allowedTools', async () => {
      const service = createService();
      await service.onModuleInit();

      // Prospect persona should get prospect-specific tools
      const prospectTools = await service.getToolsForPersona('prospect');
      const prospectToolNames = Object.keys(prospectTools);
      expect(prospectToolNames).toContain('health-check');
      expect(prospectToolNames).toContain('search-kb');
      expect(prospectToolNames).toContain('get-product-info');
      expect(prospectToolNames).toContain('request-demo');
      expect(prospectToolNames).toContain('get-pricing');
      expect(prospectToolNames).toHaveLength(5);

      // Dispatcher persona should have dispatcher-specific tools
      const dispatcherTools = await service.getToolsForPersona('dispatcher');
      const dispatcherToolNames = Object.keys(dispatcherTools);
      expect(dispatcherToolNames).toContain('health-check');
      expect(dispatcherToolNames).toContain('query-loads');
    });

    it('should return tools with execute functions', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('prospect');

      expect(tools['health-check']).toBeDefined();
      expect(tools['health-check'].execute).toBeInstanceOf(Function);
    });

    it('should call provider method when tool is executed without context', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('prospect');

      const result = await (tools['health-check'] as any).execute({});

      expect(mockHealthInstance.check).toHaveBeenCalledWith({});
      expect(result).toEqual({ status: 'ok' });
    });

    it('should inject tenant context into tool arguments', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('dispatcher', {
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
      const tools = await service.getToolsForPersona('dispatcher', {
        tenantId: 1,
        userId: '10',
        userDbId: 10,
      });

      await (tools['health-check'] as any).execute({});

      expect(mockAiPrisma.executeWithRlsContext).toHaveBeenCalledWith(
        1, // tenantId
        10, // userId (converted to number)
        'dispatcher', // role = userMode
        expect.any(Function),
      );
    });

    it('should NOT wrap with RLS when no context is provided', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('prospect');

      await (tools['health-check'] as any).execute({});

      expect(mockAiPrisma.executeWithRlsContext).not.toHaveBeenCalled();
    });

    it('should unwrap MCP content format from tool results', async () => {
      mockFleetInstance.queryLoads.mockResolvedValue({
        content: [{ type: 'text', text: '{"loads": [1, 2, 3]}' }],
      });

      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('dispatcher', {
        tenantId: 1,
        userId: '1',
        userDbId: 1,
      });
      const result = await (tools['query-loads'] as any).execute({});

      expect(result).toEqual({ loads: [1, 2, 3] });
    });

    it('should return raw result when not MCP content format', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('prospect');
      const result = await (tools['health-check'] as any).execute({});

      expect(result).toEqual({ status: 'ok' });
    });

    it('should capture card metadata via CardAccumulator', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CardAccumulator } = require('../../mcp-tool.service');

      mockFleetInstance.queryLoads.mockResolvedValue({
        content: [{ type: 'text', text: '{"loads": [1]}' }],
        _card: { type: 'load_list', data: { loads: [1] } },
      });

      const accumulator = new CardAccumulator();
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona(
        'dispatcher',
        { tenantId: 1, userId: '1', userDbId: 1 },
        accumulator,
      );

      await (tools['query-loads'] as any).execute({});

      expect(accumulator.card).toEqual({
        type: 'load_list',
        data: { loads: [1] },
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
      const tools = await service.getToolsForPersona('prospect');
      // discoverTools should have been called automatically
      expect(Object.keys(tools).length).toBeGreaterThan(0);
    });

    it('should handle MCP text content that is not valid JSON', async () => {
      mockFleetInstance.queryLoads.mockResolvedValue({
        content: [{ type: 'text', text: 'not-json' }],
      });

      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('dispatcher', {
        tenantId: 1,
        userId: '1',
        userDbId: 1,
      });
      const result = await (tools['query-loads'] as any).execute({});

      // Should return raw text when JSON parse fails
      expect(result).toBe('not-json');
    });

    it('should inject conversationId when provided in context', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('dispatcher', {
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
    it('should return toolsets object with sally-tools key', async () => {
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('prospect');
      expect(toolsets).toHaveProperty('sally-tools');
      expect(toolsets['sally-tools']).toBeDefined();
    });

    it('should include confirm-action tool for dispatcher persona', async () => {
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('dispatcher', {
        tenantId: 1,
        userId: '1',
        userDbId: 1,
      });
      // Dispatcher has write tools, so confirm-action should be injected
      expect(toolsets['sally-tools']).toHaveProperty('confirm-action');
    });

    it('should NOT include confirm-action tool for prospect persona', async () => {
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('prospect');
      expect(toolsets['sally-tools']).not.toHaveProperty('confirm-action');
    });

    it('should pass cardAccumulator through to getToolsForPersona', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CardAccumulator } = require('../../mcp-tool.service');
      const accumulator = new CardAccumulator();
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('prospect', undefined, accumulator);
      expect(toolsets['sally-tools']).toBeDefined();
    });
  });
});
