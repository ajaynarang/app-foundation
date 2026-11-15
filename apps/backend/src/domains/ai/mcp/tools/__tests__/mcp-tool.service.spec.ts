import { z } from 'zod';
import { CardAccumulator, McpToolService } from '../../mcp-tool.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { intentDigest } from '../../../agent-contract/intent-digest';
import { ToolAvailabilityService } from '../../../agent-contract/tool-availability.service';

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

  describe('tool availability', () => {
    const withheld = (...names: string[]) => new ToolAvailabilityService([{ tools: names, isAvailable: () => false }]);

    it('leaves a tool that is not available out of the toolset', async () => {
      const service = new McpToolService(mockRegistry, pipeline as never, undefined, withheld('query-items'));
      await service.onModuleInit();
      const names = Object.keys(await service.getToolsForPersona('admin', CONTEXT)).sort();
      expect(names).toEqual(['get-product-info', 'health-check', 'search-kb']);
    });

    it('offers no confirm-action when the only write is not available', async () => {
      mockRegistry.getTools.mockReturnValue(toolsWith(makeTool('create-item', z.object({}), 'createItem', ItemsTool)));
      const service = new McpToolService(mockRegistry, pipeline as never, undefined, withheld('create-item'));
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('admin', { ...CONTEXT, conversationId: 'c' });
      expect(toolsets['app-tools']).not.toHaveProperty('create-item');
      expect(toolsets['app-tools']).not.toHaveProperty('confirm-action');
    });

    it('refuses to raise a confirm card for a write that is not available', async () => {
      mockRegistry.getTools.mockReturnValue(
        toolsWith(
          makeTool('create-item', z.object({}), 'createItem', ItemsTool),
          makeTool('create-other', z.object({}), 'createItem', ItemsTool),
        ),
      );
      const challenges = { recordChatIntent: jest.fn() };
      const preflight = jest.fn().mockResolvedValue(null);
      const service = new McpToolService(
        mockRegistry,
        { ...pipeline, preflight } as never,
        challenges as never,
        withheld('create-other'),
      );
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('admin', { ...CONTEXT, conversationId: 'c' });
      const confirm = toolsets['app-tools']['confirm-action'] as any;
      const suspend = jest.fn();

      const result = await confirm.execute({ tool: 'create-other', args: {} }, { agent: { suspend, toolCallId: 't' } });

      expect(suspend).not.toHaveBeenCalled();
      expect(result.confirmed).toBe(false);
      expect(challenges.recordChatIntent).not.toHaveBeenCalled();
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
      expect(spy).toHaveBeenCalledWith('member', CONTEXT, accumulator, undefined, {});
    });

    it('a read-only toolset (a delegated sub-agent) holds no write and no confirm-action', async () => {
      mockRegistry.getTools.mockReturnValue(toolsWith(makeTool('create-item', z.object({}), 'createItem', ItemsTool)));
      const service = createService();
      await service.onModuleInit();
      const toolsets = await service.getToolsetsForPersona('admin', CONTEXT, undefined, undefined, { readOnly: true });
      expect(toolsets['app-tools']).not.toHaveProperty('create-item');
      expect(toolsets['app-tools']).not.toHaveProperty('confirm-action');
      expect(toolsets['app-tools']).toHaveProperty('query-items');
    });
  });

  describe('confirm-action records the exact write for this person in this conversation', () => {
    const itemSchema = z.object({ name: z.string(), size: z.enum(['S', 'L']).default('S') });
    const CHAT = { ...CONTEXT, conversationId: 'conv_a' };
    let challenges: { recordChatIntent: jest.Mock; confirmChatIntent: jest.Mock; declineChatIntent: jest.Mock };
    let preflight: jest.Mock;

    function chatService() {
      mockRegistry.getTools.mockReturnValue(toolsWith(makeTool('create-item', itemSchema, 'createItem', ItemsTool)));
      challenges = {
        recordChatIntent: jest.fn().mockResolvedValue(undefined),
        confirmChatIntent: jest.fn().mockResolvedValue(true),
        declineChatIntent: jest.fn().mockResolvedValue(undefined),
      };
      preflight = jest.fn().mockResolvedValue(null);
      return new McpToolService(mockRegistry, { ...pipeline, preflight } as never, challenges as never);
    }

    async function propose(service: McpToolService, context: typeof CONTEXT, tool: string, args: object) {
      const toolsets = await service.getToolsetsForPersona('admin', context);
      const confirm = toolsets['app-tools']['confirm-action'] as any;
      const suspend = jest.fn().mockResolvedValue(undefined);
      const result = await confirm.execute({ tool, args }, { agent: { suspend, toolCallId: 'call_1' } });
      return { suspend, result };
    }

    it('records the intent over the intent digest and raises the card built from the parsed arguments', async () => {
      const service = chatService();
      await service.onModuleInit();

      const { suspend } = await propose(service, CHAT, 'create-item', { name: 'Desk', _tenantId: 999 });

      expect(preflight).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'user', userId: 10, tenantId: 1, conversationId: 'conv_a' }),
        'create-item',
        { name: 'Desk', _tenantId: 999 },
      );
      expect(challenges.recordChatIntent).toHaveBeenCalledWith({
        tenantId: 1,
        userId: 10,
        conversationId: 'conv_a',
        toolCallId: 'call_1',
        toolName: 'create-item',
        argsDigest: intentDigest(itemSchema, { name: 'Desk' }),
        scopeRequired: 'platform:write',
      });
      expect(suspend.mock.calls[0][0]).toEqual({
        action: 'Create Item',
        description: 'Create Item: name: "Desk", size: "S"',
        tool: 'create-item',
        args: { name: 'Desk', size: 'S' },
        toolCallId: 'call_1',
      });
    });

    it('refuses a read, an unknown tool, bad arguments, a write the pipeline would refuse, and a chat with no conversation', async () => {
      const service = chatService();
      await service.onModuleInit();

      for (const [context, tool, args] of [
        [CHAT, 'query-items', {}],
        [CHAT, 'no-such-tool', {}],
        [CHAT, 'create-item', { name: 7 }],
        [CONTEXT, 'create-item', { name: 'Desk' }],
      ] as const) {
        const { suspend, result } = await propose(service, context, tool, args);
        expect(suspend).not.toHaveBeenCalled();
        expect(result.confirmed).toBe(false);
        expect(result.reason).toEqual(expect.any(String));
      }

      preflight.mockResolvedValue({ content: [{ type: 'text', text: '{"status":"role_not_permitted"}' }] });
      const refused = await propose(service, CHAT, 'create-item', { name: 'Desk' });
      expect(refused.suspend).not.toHaveBeenCalled();
      expect(refused.result.reason).toContain('role_not_permitted');
      expect(challenges.recordChatIntent).not.toHaveBeenCalled();
    });

    it('confirms and declines a card through the challenge service, keyed by the numeric user id', async () => {
      const service = chatService();
      const card = { tenantId: 1, userDbId: 10, conversationId: 'conv_a', toolCallId: 'call_1' };
      const key = { tenantId: 1, userId: 10, conversationId: 'conv_a', toolCallId: 'call_1' };

      expect(await service.confirmChatCard(card)).toBe(true);
      await service.declineChatCard(card);

      expect(challenges.confirmChatIntent).toHaveBeenCalledWith(key);
      expect(challenges.declineChatIntent).toHaveBeenCalledWith(key);
    });

    it('a call through the pipeline carries the conversation on its principal', async () => {
      const service = chatService();
      await service.onModuleInit();
      const tools = await service.getToolsForPersona('admin', CHAT);
      await (tools['create-item'] as any).execute({ name: 'Desk' });
      expect(pipeline.run.mock.calls[0][0]).toMatchObject({ kind: 'user', conversationId: 'conv_a' });
    });
  });
});
