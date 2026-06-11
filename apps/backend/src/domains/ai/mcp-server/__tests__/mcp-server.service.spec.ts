// Mock the MCP SDK to avoid ESM issues — must be before any import
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    Server: jest.fn().mockImplementation(() => ({
      setRequestHandler: jest.fn((schema: any, handler: (...args: unknown[]) => unknown) => {
        const key = schema === 'ListToolsRequestSchema' ? 'list' : 'call';
        handlers[key] = handler;
      }),
      connect: jest.fn(),
      close: jest.fn(),
      _handlers: handlers,
    })),
  };
});

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

import { Test, TestingModule } from '@nestjs/testing';
import { McpServerService } from '../mcp-server.service';
import { InvocationPipelineService, PipelineError } from '../../agent-contract/invocation-pipeline.service';
import { ScopeRegistryService } from '../../agent-contract/scope-registry.service';
import { fromOAuthUser } from '../../agent-contract/agent-principal';

const mockPipeline = { run: jest.fn() };
const mockScopeRegistry = {
  toolsAllowedByScopes: jest.fn(),
  getAllTools: jest.fn(),
};

describe('McpServerService', () => {
  let service: McpServerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpServerService,
        { provide: InvocationPipelineService, useValue: mockPipeline },
        { provide: ScopeRegistryService, useValue: mockScopeRegistry },
      ],
    }).compile();
    service = module.get<McpServerService>(McpServerService);
  });

  it('should initialize without errors', async () => {
    await service.onModuleInit();
  });

  describe('handleRequest', () => {
    // oauthUser.userId mirrors the production JWT shape: `String(user.id)`,
    // which the guard coerces back to a number at the principal boundary.
    const oauthUser = {
      userId: '1',
      tenantDbId: 1,
      clientId: 'client_1',
      role: 'ADMIN',
      scopes: ['platform:read', 'documents:write'],
    };

    let mockReq: any;
    let mockRes: any;

    beforeEach(() => {
      mockReq = { body: {} };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
    });

    it('should create a server and handle request', async () => {
      await service.handleRequest(mockReq, mockRes, oauthUser as any);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      expect(Server).toHaveBeenCalledWith({ name: 'app-assistant', version: '1.0.0' }, { capabilities: { tools: {} } });
    });

    it('should call transport.handleRequest with req, res, body', async () => {
      const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js'); // eslint-disable-line @typescript-eslint/no-require-imports

      await service.handleRequest(mockReq, mockRes, oauthUser as any);

      const transportInstance = StreamableHTTPServerTransport.mock.results[0].value;
      expect(transportInstance.handleRequest).toHaveBeenCalledWith(mockReq, mockRes, mockReq.body);
    });

    it('should close transport and server in finally block', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js'); // eslint-disable-line @typescript-eslint/no-require-imports

      await service.handleRequest(mockReq, mockRes, oauthUser as any);

      const serverInstance = Server.mock.results[0].value;
      const transportInstance = StreamableHTTPServerTransport.mock.results[0].value;
      expect(transportInstance.close).toHaveBeenCalled();
      expect(serverInstance.close).toHaveBeenCalled();
    });

    it('should set up ListToolsRequestSchema and CallToolRequestSchema handlers', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');

      await service.handleRequest(mockReq, mockRes, oauthUser as any);

      const serverInstance = Server.mock.results[0].value;
      expect(serverInstance.setRequestHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('listToolsForPrincipal', () => {
    it('filters registry-provided tools by principal scopes', () => {
      mockScopeRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-items']));
      mockScopeRegistry.getAllTools.mockReturnValue([
        {
          name: 'query-items',
          description: 'List items',
          inputSchema: { type: 'object', properties: {} },
          scope: 'platform:read',
        },
        {
          name: 'send-invoice',
          description: 'Send invoice',
          inputSchema: { type: 'object', properties: {} },
          scope: 'invoices:write',
        },
      ]);

      const principal = fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: ['platform:read'],
        clientId: 'c',
      });

      const tools = service.listToolsForPrincipal(principal);

      expect(mockScopeRegistry.toolsAllowedByScopes).toHaveBeenCalledWith(['platform:read']);
      // The service attaches MCP `annotations` (read-only/destructive hints)
      // so clients like Claude.ai can group tools. Verify the shape.
      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        name: 'query-items',
        description: 'List items',
        inputSchema: { type: 'object', properties: {} },
        annotations: expect.objectContaining({
          readOnlyHint: true,
          destructiveHint: false,
        }),
      });
    });
  });
});

describe('McpServerService — pipeline routing', () => {
  let service: McpServerService;
  const pipeline = { run: jest.fn() };
  const scopeRegistry = {
    toolsAllowedByScopes: jest.fn(),
    getAllTools: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        McpServerService,
        { provide: InvocationPipelineService, useValue: pipeline },
        { provide: ScopeRegistryService, useValue: scopeRegistry },
      ],
    }).compile();
    service = mod.get(McpServerService);
  });

  const oauthUser = {
    userId: '99',
    tenantDbId: 7,
    role: 'ADMIN',
    scopes: ['platform:read'],
    clientId: 'gpt-abc',
  };

  it('routes tools/call through InvocationPipelineService', async () => {
    pipeline.run.mockResolvedValue({
      content: [{ type: 'text', text: '{"count":0}' }],
    });

    const res = await service.executeToolCall('query-items', { status: 'active' }, oauthUser as any);

    expect(pipeline.run).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'oauth_client',
        clientId: 'gpt-abc',
        tenantId: 7,
      }),
      'query-items',
      { status: 'active' },
    );
    expect(res.content[0].text).toBe('{"count":0}');
  });

  it('returns pipeline_error when pipeline throws PipelineError', async () => {
    pipeline.run.mockRejectedValue(new PipelineError('scope_denied'));

    const res = await service.executeToolCall('query-items', {}, oauthUser as any);

    expect(pipeline.run).toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/pipeline_error/);
    expect(res.content[0].text).toMatch(/scope_denied/);
  });

  it('propagates non-PipelineError exceptions from the pipeline', async () => {
    pipeline.run.mockRejectedValue(new Error('db is on fire'));

    await expect(service.executeToolCall('query-items', {}, oauthUser as any)).rejects.toThrow(/db is on fire/);
  });
});
