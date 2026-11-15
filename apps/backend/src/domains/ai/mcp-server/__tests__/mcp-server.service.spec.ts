// Mock the MCP SDK to avoid ESM issues — must be before any import
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const handlers: Record<string, (...args: unknown[]) => unknown> = {};
  return {
    Server: jest.fn().mockImplementation(() => ({
      setRequestHandler: jest.fn((schema: any, handler: (...args: unknown[]) => unknown) => {
        handlers[schema as string] = handler;
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
  ...jest.requireActual('@modelcontextprotocol/sdk/types.js'),
  ListToolsRequestSchema: 'ListToolsRequestSchema',
  CallToolRequestSchema: 'CallToolRequestSchema',
  ListPromptsRequestSchema: 'ListPromptsRequestSchema',
  GetPromptRequestSchema: 'GetPromptRequestSchema',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { McpServerService } from '../mcp-server.service';
import { NotFoundException } from '@nestjs/common';
import { InvocationPipelineService } from '../../agent-contract/invocation-pipeline.service';
import { TOOL_FAILED_MESSAGE } from '../../mcp/tools/tool-error';
import { ScopeRegistryService } from '../../agent-contract/scope-registry.service';
import { fromApiKey, fromOAuthUser } from '@appshore/platform/auth/agent-principal';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { AssistantPrompt } from '@app/shared-types';
import { ToolAccessPolicyService } from '../../agent-contract/tool-access-policy.service';
import {
  TOOL_AVAILABILITY_RULES,
  ToolAvailabilityService,
  type ToolAvailabilityRule,
} from '../../agent-contract/tool-availability.service';
import { PROMPT_LIBRARY_TOKEN, PromptRegistryService } from '../../assistant/prompts/prompt-registry.service';

const mockPipeline = { run: jest.fn() };
const accessPolicy = { actingRole: jest.fn() };
let availabilityRules: ToolAvailabilityRule[] = [];

const PROMPTS: AssistantPrompt[] = [
  {
    name: 'open-support-tickets',
    title: 'Open support tickets',
    description: 'What is still waiting on support',
    category: 'Support',
    arguments: [{ name: 'topic', description: 'Only tickets about this', required: false }],
    template: 'List the open tickets about {{topic}}. <tools>Use list-support-tickets.</tools>',
    roles: ['OWNER', 'ADMIN', 'MEMBER'],
    suggestedTools: ['list-support-tickets'],
  },
  {
    name: 'owner-review',
    title: 'Owner review',
    description: 'Owner-only summary',
    category: 'Owner',
    arguments: [],
    template: 'Summarise the workspace for its owner.',
    roles: ['OWNER'],
    suggestedTools: [],
  },
];

/** The availability service and prompt registry run for real; only the role lookup is stubbed. */
function sharedProviders() {
  return [
    { provide: ToolAccessPolicyService, useValue: accessPolicy },
    { provide: TOOL_AVAILABILITY_RULES, useFactory: () => availabilityRules },
    ToolAvailabilityService,
    { provide: PROMPT_LIBRARY_TOKEN, useValue: PROMPTS },
    PromptRegistryService,
  ];
}
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
        ...sharedProviders(),
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
      await service.handleRequest(mockReq, mockRes, oauthUser);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      expect(Server).toHaveBeenCalledWith(
        { name: 'app-assistant', version: '1.0.0' },
        { capabilities: { tools: {}, prompts: {} } },
      );
    });

    it('should call transport.handleRequest with req, res, body', async () => {
      const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js'); // eslint-disable-line @typescript-eslint/no-require-imports

      await service.handleRequest(mockReq, mockRes, oauthUser);

      const transportInstance = StreamableHTTPServerTransport.mock.results[0].value;
      expect(transportInstance.handleRequest).toHaveBeenCalledWith(mockReq, mockRes, mockReq.body);
    });

    it('should close transport and server in finally block', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js'); // eslint-disable-line @typescript-eslint/no-require-imports

      await service.handleRequest(mockReq, mockRes, oauthUser);

      const serverInstance = Server.mock.results[0].value;
      const transportInstance = StreamableHTTPServerTransport.mock.results[0].value;
      expect(transportInstance.close).toHaveBeenCalled();
      expect(serverInstance.close).toHaveBeenCalled();
    });

    it('sets up the tools/list, tools/call, prompts/list and prompts/get handlers', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');

      await service.handleRequest(mockReq, mockRes, oauthUser);

      const serverInstance = Server.mock.results[0].value;
      expect(serverInstance.setRequestHandler).toHaveBeenCalledTimes(4);
      expect(Object.keys(serverInstance._handlers).sort()).toEqual([
        'CallToolRequestSchema',
        'GetPromptRequestSchema',
        'ListPromptsRequestSchema',
        'ListToolsRequestSchema',
      ]);
    });

    it('serves prompts/list and prompts/get through the handlers for the acting person', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
      accessPolicy.actingRole.mockResolvedValue('MEMBER');

      await service.handleRequest(mockReq, mockRes, oauthUser);
      const handlers = Server.mock.results[0].value._handlers;

      const list = await handlers.ListPromptsRequestSchema({ method: 'prompts/list', params: {} });
      expect(list.prompts.map((p: { name: string }) => p.name)).toEqual(['open-support-tickets']);
      const got = await handlers.GetPromptRequestSchema({
        method: 'prompts/get',
        params: { name: 'open-support-tickets', arguments: { topic: 'billing' } },
      });
      expect(got.messages[0].content.text).toBe('List the open tickets about billing. Use list-support-tickets.');
      expect(accessPolicy.actingRole).toHaveBeenCalledWith(expect.objectContaining({ kind: 'oauth_client' }));
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

describe('McpServerService — tool availability', () => {
  let service: McpServerService;
  const scopeRegistry = { toolsAllowedByScopes: jest.fn(), getAllTools: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    availabilityRules = [{ tools: ['send-sms'], isAvailable: () => false }];
    const mod = await Test.createTestingModule({
      providers: [
        McpServerService,
        { provide: InvocationPipelineService, useValue: mockPipeline },
        { provide: ScopeRegistryService, useValue: scopeRegistry },
        ...sharedProviders(),
      ],
    }).compile();
    service = mod.get(McpServerService);
  });

  afterEach(() => {
    availabilityRules = [];
  });

  it('leaves a tool that is not available out of tools/list, even when the scopes allow it', () => {
    scopeRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-items', 'send-sms']));
    scopeRegistry.getAllTools.mockReturnValue([
      { name: 'query-items', description: 'List items', inputSchema: {}, scope: 'platform:read' },
      { name: 'send-sms', description: 'Send a text', inputSchema: {}, scope: 'platform:write' },
    ]);
    const principal = fromOAuthUser({
      onBehalfOfUserDbId: 1,
      tenantDbId: 7,
      role: 'ADMIN',
      scopes: ['platform:read', 'platform:write'],
      clientId: 'c',
    });

    expect(service.listToolsForPrincipal(principal).map((t) => t.name)).toEqual(['query-items']);
  });
});

describe('McpServerService — prompts', () => {
  let service: McpServerService;
  const oauth = fromOAuthUser({ onBehalfOfUserDbId: 5, tenantDbId: 7, role: 'OWNER', scopes: [], clientId: 'c' });

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        McpServerService,
        { provide: InvocationPipelineService, useValue: mockPipeline },
        { provide: ScopeRegistryService, useValue: mockScopeRegistry },
        ...sharedProviders(),
      ],
    }).compile();
    service = mod.get(McpServerService);
  });

  it("lists the prompts of the acting person's CURRENT role in this workspace, not the token's role", async () => {
    // The token says OWNER; the membership row now says MEMBER.
    accessPolicy.actingRole.mockResolvedValue('MEMBER');

    const prompts = await service.listPromptsForPrincipal(oauth);

    expect(accessPolicy.actingRole).toHaveBeenCalledWith(oauth);
    expect(prompts).toEqual([
      {
        name: 'open-support-tickets',
        title: 'Open support tickets',
        description: 'What is still waiting on support',
        arguments: [{ name: 'topic', description: 'Only tickets about this', required: false }],
      },
    ]);
  });

  it('lists every prompt the role may see for an owner', async () => {
    accessPolicy.actingRole.mockResolvedValue('OWNER');
    const names = (await service.listPromptsForPrincipal(oauth)).map((p) => p.name);
    expect(names).toEqual(['open-support-tickets', 'owner-review']);
  });

  it('lists nothing for an API key whose owner has no membership in the workspace', async () => {
    accessPolicy.actingRole.mockResolvedValue(null);
    const key = fromApiKey({ apiKeyId: 1, tenantId: 7, userId: 42, scopes: ['platform:read'] });
    expect(await service.listPromptsForPrincipal(key)).toEqual([]);
  });

  it('renders a prompt into one user message', async () => {
    accessPolicy.actingRole.mockResolvedValue('ADMIN');
    const res = await service.getPromptForPrincipal('open-support-tickets', { topic: 'billing' }, oauth);
    expect(res).toEqual({
      description: 'What is still waiting on support',
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: 'List the open tickets about billing. Use list-support-tickets.' },
        },
      ],
    });
  });

  it.each([
    ['a prompt the role may not see', 'owner-review', {}],
    ['an unknown prompt', 'nope', {}],
    ['an argument the prompt does not declare', 'open-support-tickets', { bogus: 'x' }],
  ])('answers %s with an MCP invalid-params error and a safe message', async (_label, name, args) => {
    accessPolicy.actingRole.mockResolvedValue('MEMBER');
    const err = await service.getPromptForPrincipal(name, args, oauth).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpError);
    expect((err as McpError).code).toBe(ErrorCode.InvalidParams);
  });

  it('names the undeclared argument in the error message', async () => {
    accessPolicy.actingRole.mockResolvedValue('MEMBER');
    const err = await service.getPromptForPrincipal('open-support-tickets', { bogus: 'x' }, oauth).catch((e) => e);
    expect((err as McpError).message).toMatch(/bogus/);
  });

  it('lets an unexpected failure through unchanged, for the SDK to answer as an internal error', async () => {
    accessPolicy.actingRole.mockRejectedValue(new Error('db down'));
    await expect(service.getPromptForPrincipal('open-support-tickets', {}, oauth)).rejects.toThrow('db down');
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
        ...sharedProviders(),
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

    const res = await service.executeToolCall('query-items', { status: 'active' }, oauthUser);

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

  it('answers a pipeline throw with the generic failure, never the raw message', async () => {
    pipeline.run.mockRejectedValue(new Error('db is on fire at 10.0.0.5'));

    const res = await service.executeToolCall('query-items', {}, oauthUser);

    expect(pipeline.run).toHaveBeenCalled();
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text)).toEqual({ error: TOOL_FAILED_MESSAGE, code: 'TOOL_FAILED' });
    expect(res.content[0].text).not.toMatch(/db is on fire/);
  });

  it('passes an HttpException message and code through', async () => {
    pipeline.run.mockRejectedValue(new NotFoundException('That ticket was not found'));

    const res = await service.executeToolCall('query-items', {}, oauthUser);

    expect(JSON.parse(res.content[0].text)).toEqual({ error: 'That ticket was not found', code: 'NOT_FOUND' });
  });
});
