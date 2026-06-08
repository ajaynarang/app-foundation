import { Test } from '@nestjs/testing';
import { ScopeRegistryService } from '../scope-registry.service';
import { RequiresScope } from '../requires-scope.decorator';
import { McpRegistryDiscoveryService } from '@rekog/mcp-nest';

class FleetReadTool {
  @RequiresScope('platform:read')
  queryLoads() {
    return 'ok';
  }
}

class InvoiceWriteTool {
  @RequiresScope('platform:write')
  sendInvoice() {
    return 'ok';
  }
}

class NoScopeTool {
  bareMethod() {
    return 'ok';
  }
}

const mockMcpRegistry = () => ({
  getMcpModuleIds: jest.fn().mockReturnValue(['m1']),
  getTools: jest.fn().mockReturnValue([
    {
      metadata: { name: 'query-loads', description: 'q', parameters: null },
      providerClass: FleetReadTool,
      methodName: 'queryLoads',
    },
    {
      metadata: { name: 'send-invoice', description: 's', parameters: null },
      providerClass: InvoiceWriteTool,
      methodName: 'sendInvoice',
    },
  ]),
});

describe('ScopeRegistryService', () => {
  it('builds scope→tool map at onApplicationBootstrap', async () => {
    const registry = mockMcpRegistry();
    const mod = await Test.createTestingModule({
      providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
    }).compile();
    const svc = mod.get(ScopeRegistryService);
    await svc.onApplicationBootstrap();
    expect(svc.toolsForScope('platform:read')).toEqual(['query-loads']);
    expect(svc.toolsForScope('platform:write')).toEqual(['send-invoice']);
    expect(svc.scopeForTool('query-loads')).toBe('platform:read');
  });

  it('resolveScopesForPrincipal expands tools allowed by granted scopes', async () => {
    const registry = mockMcpRegistry();
    const mod = await Test.createTestingModule({
      providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
    }).compile();
    const svc = mod.get(ScopeRegistryService);
    await svc.onApplicationBootstrap();
    expect(svc.toolsAllowedByScopes(['platform:read'])).toEqual(new Set(['query-loads']));
    expect(svc.toolsAllowedByScopes(['platform:read', 'platform:write'])).toEqual(
      new Set(['query-loads', 'send-invoice']),
    );
  });

  it('throws at boot if a tool class method has no @RequiresScope', async () => {
    const registry = {
      getMcpModuleIds: () => ['m1'],
      getTools: () => [
        {
          metadata: { name: 'bare', description: '', parameters: null },
          providerClass: NoScopeTool,
          methodName: 'bareMethod',
        },
      ],
    };
    const mod = await Test.createTestingModule({
      providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
    }).compile();
    const svc = mod.get(ScopeRegistryService);
    await expect(svc.onApplicationBootstrap()).rejects.toThrow(/missing @RequiresScope/);
  });

  it('throws at boot if two @Tool decorators share the same name', async () => {
    class FirstTool {
      @RequiresScope('platform:read')
      run() {
        return 'ok';
      }
    }
    class SecondTool {
      @RequiresScope('platform:read')
      run() {
        return 'ok';
      }
    }
    const registry = {
      getMcpModuleIds: () => ['m1'],
      getTools: () => [
        {
          metadata: {
            name: 'duplicate-name',
            description: '',
            parameters: null,
          },
          providerClass: FirstTool,
          methodName: 'run',
        },
        {
          metadata: {
            name: 'duplicate-name',
            description: '',
            parameters: null,
          },
          providerClass: SecondTool,
          methodName: 'run',
        },
      ],
    };
    const mod = await Test.createTestingModule({
      providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
    }).compile();
    const svc = mod.get(ScopeRegistryService);
    await expect(svc.onApplicationBootstrap()).rejects.toThrow(
      /Duplicate @Tool name "duplicate-name".*FirstTool.*SecondTool/,
    );
  });

  it('throws at boot if a permanently excluded tool name is registered', async () => {
    const registry = {
      getMcpModuleIds: () => ['m1'],
      getTools: () => [
        {
          metadata: { name: 'cache-flush', description: '', parameters: null },
          providerClass: FleetReadTool,
          methodName: 'queryLoads',
        },
      ],
    };
    const mod = await Test.createTestingModule({
      providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
    }).compile();
    const svc = mod.get(ScopeRegistryService);
    await expect(svc.onApplicationBootstrap()).rejects.toThrow(/permanently excluded/);
  });

  it('toolsForScope expands sensitive → standard → read additively', async () => {
    class InvoicesReadTool {
      @RequiresScope('platform:read')
      x() {}
    }
    class InvoicesWriteTool {
      @RequiresScope('platform:write')
      x() {}
    }
    class InvoicesVoidTool {
      @RequiresScope('platform:write:sensitive')
      x() {}
    }
    const registry = {
      getMcpModuleIds: () => ['m1'],
      getTools: () => [
        {
          metadata: { name: 'read', description: '', parameters: null },
          providerClass: InvoicesReadTool,
          methodName: 'x',
        },
        {
          metadata: { name: 'write', description: '', parameters: null },
          providerClass: InvoicesWriteTool,
          methodName: 'x',
        },
        {
          metadata: { name: 'void', description: '', parameters: null },
          providerClass: InvoicesVoidTool,
          methodName: 'x',
        },
      ],
    };
    const mod = await Test.createTestingModule({
      providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
    }).compile();
    const svc = mod.get(ScopeRegistryService);
    await svc.onApplicationBootstrap();
    expect(svc.toolsAllowedByScopes(['platform:write:sensitive'])).toEqual(new Set(['read', 'write', 'void']));
    expect(svc.toolsAllowedByScopes(['platform:write'])).toEqual(new Set(['read', 'write']));
    expect(svc.toolsAllowedByScopes(['platform:read'])).toEqual(new Set(['read']));
  });

  describe('getAllTools', () => {
    it('returns MCP-shape descriptors with description + inputSchema', async () => {
      const registry = mockMcpRegistry();
      const mod = await Test.createTestingModule({
        providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
      }).compile();
      const svc = mod.get(ScopeRegistryService);
      await svc.onApplicationBootstrap();

      const tools = svc.getAllTools();
      expect(tools).toHaveLength(2);
      const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
      expect(byName['query-loads']).toMatchObject({
        name: 'query-loads',
        description: 'q',
      });
      // Schema always includes the `_confirmToken` hint so external agents
      // can replay HITL-required calls without hand-coded knowledge.
      expect(byName['query-loads'].inputSchema).toMatchObject({
        type: 'object',
        properties: {
          _confirmToken: expect.objectContaining({ type: 'string' }),
        },
      });
      expect(byName['send-invoice'].description).toBe('s');
    });

    it('converts a Zod schema to JSON schema and strips internal params', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { z } = require('zod');
      const params = z.object({
        loadId: z.number(),
        _tenantId: z.number(),
        _userId: z.number(),
      });
      class ToolWithSchema {
        @RequiresScope('platform:read')
        run() {}
      }
      const registry = {
        getMcpModuleIds: () => ['m1'],
        getTools: () => [
          {
            metadata: {
              name: 'fleet-tool',
              description: 'schema-bearing tool',
              parameters: params,
            },
            providerClass: ToolWithSchema,
            methodName: 'run',
          },
        ],
      };
      const mod = await Test.createTestingModule({
        providers: [ScopeRegistryService, { provide: McpRegistryDiscoveryService, useValue: registry }],
      }).compile();
      const svc = mod.get(ScopeRegistryService);
      await svc.onApplicationBootstrap();

      const [tool] = svc.getAllTools();
      expect(tool.name).toBe('fleet-tool');
      const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
      expect(props).toHaveProperty('loadId');
      expect(props).not.toHaveProperty('_tenantId');
      expect(props).not.toHaveProperty('_userId');
      const required = (tool.inputSchema as { required?: string[] }).required;
      if (required) {
        expect(required).not.toContain('_tenantId');
        expect(required).not.toContain('_userId');
      }
    });
  });
});
