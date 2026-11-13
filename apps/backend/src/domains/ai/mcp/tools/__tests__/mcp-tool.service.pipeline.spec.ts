import { z } from 'zod';
import { McpToolService, TOOL_PIPELINE_UNAVAILABLE } from '../../mcp-tool.service';
import { TOOL_FAILED_MESSAGE } from '../tool-error';

/**
 * Pipeline routing for McpToolService. Every chat tool call goes through InvocationPipelineService.run(...). There is
 * no path to a tool method around it: with the pipeline unset the call is refused, and a pipeline throw is answered
 * with a safe failure (never by running the tool directly, never with the raw message).
 */
describe('McpToolService — pipeline routing', () => {
  const recordsProvider = { queryRecords: jest.fn() };

  function buildRegistry() {
    return {
      getMcpModuleIds: jest.fn().mockReturnValue(['test-module']),
      getTools: jest.fn().mockReturnValue([
        {
          type: 'tool',
          metadata: { name: 'query-records', description: 'Query', parameters: z.object({}) },
          providerClass: class RecordsQueryTool {},
          methodName: 'queryRecords',
        },
      ]),
    };
  }

  const CONTEXT = { tenantId: 7, userId: '42', userDbId: 42 };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes through the pipeline and returns unwrapped JSON', async () => {
    const pipeline = { run: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '{"count":5}' }] }) };
    const svc = new McpToolService(buildRegistry() as any, pipeline as any);
    await svc.onModuleInit();

    const tools = await svc.getToolsForPersona('member', CONTEXT);
    const result = await (tools['query-records'] as any).execute({ status: 'active' });

    expect(pipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 42, tenantId: 7 }),
      'query-records',
      { status: 'active' },
    );
    expect(result).toEqual({ count: 5 });
  });

  it('refuses the call with tool_pipeline_unavailable when the pipeline is not wired', async () => {
    const svc = new McpToolService(buildRegistry() as any, undefined);
    await svc.onModuleInit();

    const tools = await svc.getToolsForPersona('member', CONTEXT);
    const result = await (tools['query-records'] as any).execute({});

    expect(result).toEqual({ error: TOOL_PIPELINE_UNAVAILABLE, tool: 'query-records' });
    expect(recordsProvider.queryRecords).not.toHaveBeenCalled();
  });

  it('answers a pipeline throw with the safe failure and never falls back to the tool', async () => {
    const pipeline = { run: jest.fn().mockRejectedValue(new Error('relation "x" does not exist')) };
    const svc = new McpToolService(buildRegistry() as any, pipeline as any);
    await svc.onModuleInit();

    const tools = await svc.getToolsForPersona('member', CONTEXT);
    const result = await (tools['query-records'] as any).execute({});

    expect(result).toEqual({ error: TOOL_FAILED_MESSAGE, code: 'TOOL_FAILED' });
    expect(recordsProvider.queryRecords).not.toHaveBeenCalled();
  });

  it('hands the pipeline the model args untouched; the pipeline (not this file) drops `_` keys', async () => {
    const pipeline = { run: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '{}' }] }) };
    const svc = new McpToolService(buildRegistry() as any, pipeline as any);
    await svc.onModuleInit();

    const tools = await svc.getToolsForPersona('member', CONTEXT);
    await (tools['query-records'] as any).execute({ _tenantId: 999 });

    // The principal is built from the session context, whatever the model sent.
    expect(pipeline.run).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 7, userId: 42 }), 'query-records', {
      _tenantId: 999,
    });
  });
});
