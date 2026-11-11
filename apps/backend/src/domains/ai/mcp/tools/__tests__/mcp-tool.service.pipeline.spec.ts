import { z } from 'zod';
import { McpToolService } from '../../mcp-tool.service';
import { PipelineError } from '../../../agent-contract/invocation-pipeline.service';

/**
 * Pipeline-routing tests for McpToolService.
 *
 * Tool `execute` closures delegate to InvocationPipelineService.run(...)
 * when a pipeline service is provided and tenant context is available.
 * When no pipeline is wired (Mastra boot-order edge case), or the pipeline
 * throws PipelineError, the legacy in-closure path runs.
 */
describe('McpToolService — pipeline routing', () => {
  const healthSymbol = Symbol('HealthTool');
  const recordsSymbol = Symbol('RecordsQueryTool');
  const mockHealthInstance = {
    healthCheck: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"status":"ok"}' }],
    }),
  };
  const mockRecordsInstance = {
    queryRecords: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"count":0}' }],
    }),
  };

  function buildRegistry() {
    return {
      getMcpModuleIds: jest.fn().mockReturnValue(['test-module']),
      getTools: jest.fn().mockReturnValue([
        {
          type: 'tool',
          metadata: {
            name: 'health-check',
            description: 'Check health',
            parameters: z.object({}),
          },
          providerClass: healthSymbol,
          methodName: 'healthCheck',
        },
        {
          type: 'tool',
          metadata: {
            name: 'query-records',
            description: 'Query loads',
            parameters: z.object({}),
          },
          providerClass: recordsSymbol,
          methodName: 'queryRecords',
        },
      ]),
    };
  }

  const mockModuleRef = {
    get: jest.fn().mockImplementation((token: any) => {
      if (token === healthSymbol) return mockHealthInstance;
      if (token === recordsSymbol) return mockRecordsInstance;
      return null;
    }),
  };

  const mockAiPrisma = {
    executeWithRlsContext: jest.fn((_t, _u, _r, fn) => fn()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes through pipeline and returns unwrapped JSON', async () => {
    const pipeline = {
      run: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"count":5}' }],
      }),
    };

    const svc = new McpToolService(buildRegistry() as any, mockModuleRef as any, mockAiPrisma as any, pipeline as any);
    await svc.onModuleInit();

    const tools = await svc.getToolsForPersona('member', {
      tenantId: 7,
      userId: '42',
      userDbId: 42,
    });
    const result = await (tools['query-records'] as any).execute({
      status: 'active',
    });

    expect(pipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'user', userId: 42, tenantId: 7 }),
      'query-records',
      { status: 'active' },
    );
    expect(mockRecordsInstance.queryRecords).not.toHaveBeenCalled();
    expect(mockAiPrisma.executeWithRlsContext).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 5 });
  });

  it('falls through to legacy path when pipeline throws PipelineError', async () => {
    const pipeline = {
      run: jest.fn().mockRejectedValue(new PipelineError('unrecoverable pipeline error')),
    };

    const svc = new McpToolService(buildRegistry() as any, mockModuleRef as any, mockAiPrisma as any, pipeline as any);
    await svc.onModuleInit();

    const tools = await svc.getToolsForPersona('member', {
      tenantId: 7,
      userId: '42',
      userDbId: 42,
    });
    await (tools['query-records'] as any).execute({});

    expect(pipeline.run).toHaveBeenCalled();
    expect(mockRecordsInstance.queryRecords).toHaveBeenCalled();
  });

  it('skips pipeline branch when no execution context is provided', async () => {
    const pipeline = { run: jest.fn() };

    const svc = new McpToolService(buildRegistry() as any, mockModuleRef as any, mockAiPrisma as any, pipeline as any);
    await svc.onModuleInit();

    const tools = await svc.getToolsForPersona('prospect');
    await (tools['health-check'] as any).execute({});

    expect(pipeline.run).not.toHaveBeenCalled();
    expect(mockHealthInstance.healthCheck).toHaveBeenCalled();
  });
});
