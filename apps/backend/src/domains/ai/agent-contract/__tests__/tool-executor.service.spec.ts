import { Test } from '@nestjs/testing';
import { ToolExecutorService } from '../tool-executor.service';
import { ScopeRegistryService } from '../scope-registry.service';
import { AiPrismaService } from '../../rls/ai-prisma.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ModuleRef } from '@nestjs/core';
import { fromUser } from '../agent-principal';

const mockScopeRegistry = {
  resolveProvider: jest.fn(),
};
const mockAiPrisma = {
  executeWithRlsContext: jest.fn((_t, _u, _r, fn) => fn()),
};
const mockModuleRef = {
  get: jest.fn(),
};
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

describe('ToolExecutorService', () => {
  let svc: ToolExecutorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 'user_demo_owner' });
    const mod = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        { provide: ScopeRegistryService, useValue: mockScopeRegistry },
        { provide: AiPrismaService, useValue: mockAiPrisma },
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    svc = mod.get(ToolExecutorService);
  });

  it('wraps the tool call in RLS context and injects _tenantId/_userId (string)/_userDbId (number)', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({
      providerClass: ToolClass,
      methodName: 'run',
    });
    const instance = {
      run: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    };
    mockModuleRef.get.mockReturnValue(instance);

    const principal = fromUser({ userId: 42, tenantId: 7, role: 'DISPATCHER' });
    const result = await svc.execute('query-loads', { status: 'active' }, principal);

    // RLS uses the numeric DB id (required for role='driver' bindings)
    expect(mockAiPrisma.executeWithRlsContext).toHaveBeenCalledWith(7, 42, 'DISPATCHER', expect.any(Function));
    // Tools receive the wire-format string userId (what `User.userId`
    // column stores and what VARCHAR audit columns expect), plus the
    // numeric DB id as `_userDbId` for FK joins.
    expect(instance.run).toHaveBeenCalledWith({
      status: 'active',
      _tenantId: 7,
      _userId: 'user_demo_owner',
      _userDbId: 42,
    });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { userId: true },
    });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('injects _userId: null when the user row cannot be resolved', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({
      providerClass: ToolClass,
      methodName: 'run',
    });
    const instance = {
      run: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    };
    mockModuleRef.get.mockReturnValue(instance);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const principal = fromUser({ userId: 999, tenantId: 1, role: 'ADMIN' });
    await svc.execute('x', {}, principal);

    expect(instance.run).toHaveBeenCalledWith(expect.objectContaining({ _userId: null, _userDbId: 999 }));
  });

  it('wraps string/object results that are not already MCP-shaped', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({
      providerClass: ToolClass,
      methodName: 'run',
    });
    const instance = { run: jest.fn().mockResolvedValue('bare-string') };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });

    const result = await svc.execute('x', {}, principal);
    expect(result.content[0].text).toBe('bare-string');
  });

  it('returns an isError result when the provider method throws', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({
      providerClass: ToolClass,
      methodName: 'run',
    });
    const instance = { run: jest.fn().mockRejectedValue(new Error('boom')) };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });

    const result = await svc.execute('x', {}, principal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/boom/);
  });

  it('returns isError when the tool is unknown and does not touch aiPrisma', async () => {
    mockScopeRegistry.resolveProvider.mockReturnValue(undefined);
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });
    const result = await svc.execute('unknown', {}, principal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unknown tool/);
    expect(mockAiPrisma.executeWithRlsContext).not.toHaveBeenCalled();
  });
});
