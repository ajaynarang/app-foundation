// Mock the MCP SDK to avoid ESM issues — must be before any import
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn().mockImplementation(() => ({
    handleRequest: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
}));

import { Test } from '@nestjs/testing';
import { McpServerService } from '../mcp-server.service';
import { InvocationPipelineService } from '../../agent-contract/invocation-pipeline.service';
import { ScopeRegistryService } from '../../agent-contract/scope-registry.service';
import { fromApiKey } from '../../agent-contract/agent-principal';

describe('McpServerService — API-key principal path', () => {
  let service: McpServerService;
  const pipeline = { run: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        McpServerService,
        { provide: InvocationPipelineService, useValue: pipeline },
        { provide: ScopeRegistryService, useValue: {} },
      ],
    }).compile();
    service = mod.get(McpServerService);
  });

  it('executeToolCallForPrincipal routes api_key principal through pipeline', async () => {
    pipeline.run.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    const principal = fromApiKey({
      apiKeyId: 1,
      tenantId: 7,
      userId: 42,
      scopes: ['fleet:read'],
    });
    const res = await service.executeToolCallForPrincipal('query-loads', { status: 'active' }, principal);

    expect(pipeline.run).toHaveBeenCalledWith(principal, 'query-loads', {
      status: 'active',
    });
    expect(res.content[0].text).toBe('ok');
  });
});
