import { z } from 'zod';
import { CardAccumulator, McpToolService } from '../../mcp-tool.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';

/**
 * McpToolService unit tests: tool exposure, the result unwrap, cards, and the write set derived from scopes. Every
 * call goes through the pipeline (mocked here); `mcp-tool.service.pipeline.spec.ts` covers the routing itself.
 */
class HealthTool {
  @RequiresScope('platform:read')
  check() {}
}
class KnowledgeTool {
  @RequiresScope('knowledge:read')
  searchKB() {}
  @RequiresScope('knowledge:read')
  getProductInfo() {}
}
class ItemsTool {
  @RequiresScope('platform:read')
  queryItems() {}
  @RequiresScope('platform:write')
  createItem() {}
}

describe('McpToolService', () => {
  let mockRegistry: any;
  let pipeline: { run: jest.Mock };
  const CONTEXT = { tenantId: 1, userId: '10', userDbId: 10 };

  function makeTool(name: string, parameters: z.ZodType, methodName: string, providerClass: unknown) {
    return { type: 'tool', metadata: { name, description: name, parameters }, providerClass, methodName };
  }

  function toolsWith(...extra: ReturnType<typeof makeTool>[]) {
    return [
      makeTool('health-check', z.object({}), 'check', HealthTool),
      makeTool('search-kb', z.object({ query: z.string() }), 'searchKB', KnowledgeTool),
      makeTool('get-product-info', z.object({ topic: z.string() }), 'getProductInfo', KnowledgeTool),
      makeTool('query-items', z.object({}), 'queryItems', ItemsTool),
      ...extra,
    ];
  }

  beforeEach(() => {
    mockRegistry = {
      getMcpModuleIds: jest.fn().mockReturnValue(['test-module']),
      getTools: jest.fn().mockReturnValue(toolsWith()),
    };
    pipeline = { run: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"status":"ok"}' }] }) };
  });

  function createService(): McpToolService {
    return new McpToolService(mockRegistry, pipeline as never);
  }

  describe('getToolsForPersona', () => {
    it('exposes every discovered tool to all personas (no per-persona allowlist in the starter)', async () => {
      const service = createService();
      await service.onModuleInit();

      for (const persona of ['member', 'admin']) {
        const toolNames = Object.keys(await service.getToolsForPersona(persona, CONTEXT));
        expect(toolNames.sort()).toEqual(['get-product-info', 'health-check', 'query-items', 'search-kb']);
      }
    });

    it('returns tools with execute functions that run through the pipeline', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('member', CONTEXT);

      const result = await (tools['health-check'] as any).execute({});

      expect(pipeline.run).toHaveBeenCalledWith(expect.objectContaining({ kind: 'user' }), 'health-check', {});
      expect(result).toEqual({ status: 'ok' });
    });

    it('unwraps MCP content, and returns raw text when it is not JSON', async () => {
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', CONTEXT);

      pipeline.run.mockResolvedValueOnce({ content: [{ type: 'text', text: '{"items": [1, 2, 3]}' }] });
      expect(await (tools['query-items'] as any).execute({})).toEqual({ items: [1, 2, 3] });

      pipeline.run.mockResolvedValueOnce({ content: [{ type: 'text', text: 'not-json' }] });
      expect(await (tools['query-items'] as any).execute({})).toBe('not-json');
    });

    it('captures card metadata via CardAccumulator', async () => {
      pipeline.run.mockResolvedValue({
        content: [{ type: 'text', text: '{"items": [1]}' }],
        _card: { type: 'item_list', data: { items: [1] } },
      });
      const accumulator = new CardAccumulator();
      const service = createService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', CONTEXT, accumulator);

      await (tools['query-items'] as any).execute({});

      expect(accumulator.card).toEqual({ type: 'item_list', data: { items: [1] } });
    });

    it('returns a null card when nothing was captured', () => {
      expect(new CardAccumulator().card).toBeNull();
    });

    it('re-discovers tools if allTools is empty', async () => {
      const service = createService();
      const tools = await service.getToolsForPersona('member', CONTEXT);
      expect(Object.keys(tools).length).toBeGreaterThan(0);
    });
  });

  describe('the write set comes from scopes, not a list', () => {
    it('a tool is a write exactly when its @RequiresScope is not read tier', async () => {
      mockRegistry.getTools.mockReturnValue(toolsWith(makeTool('create-item', z.object({}), 'createItem', ItemsTool)));
      const service = createService();
      await service.onModuleInit();

      expect(service.isWriteTool('create-item')).toBe(true);
      expect(service.isWriteTool('query-items')).toBe(false);
      expect(service.isWriteTool('search-kb')).toBe(false);
      expect(service.isWriteTool('nope')).toBe(false);
      expect(service.getAllWriteTools()).toEqual(['create-item']);
      expect(service.getToolMetadata('create-item')).toEqual({ description: 'create-item', kind: 'write' });
      expect(service.getToolMetadata('query-items')?.kind).toBe('read');
    });
  });

  describe('getToolsetsForPersona', () => {
    it('returns a toolsets object with the app-tools key', async () => {
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('member', CONTEXT);
      expect(toolsets['app-tools']).toBeDefined();
    });

    it('offers no confirm-action when the toolset holds no write', async () => {
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('admin', CONTEXT);
      expect(toolsets['app-tools']).not.toHaveProperty('confirm-action');
    });

    it('offers confirm-action as soon as one tool has a write scope', async () => {
      mockRegistry.getTools.mockReturnValue(toolsWith(makeTool('create-item', z.object({}), 'createItem', ItemsTool)));
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('admin', CONTEXT);
      expect(toolsets['app-tools']).toHaveProperty('confirm-action');
    });

    it('passes the cardAccumulator through to getToolsForPersona', async () => {
      const accumulator = new CardAccumulator();
      const service = createService();
      await service.onModuleInit();
      const spy = jest.spyOn(service, 'getToolsForPersona');
      await service.getToolsetsForPersona('member', CONTEXT, accumulator);
      expect(spy).toHaveBeenCalledWith('member', CONTEXT, accumulator, undefined);
    });
  });
});
