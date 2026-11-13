import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TOOL_FAILED_MESSAGE } from '../../mcp/tools/tool-error';
import { ToolExecutorService } from '../tool-executor.service';
import { ScopeRegistryService } from '../scope-registry.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { ModuleRef } from '@nestjs/core';
import { fromUser } from '@appshore/platform/auth/agent-principal';

const mockScopeRegistry = {
  resolveProvider: jest.fn(),
};
const mockModuleRef = {
  get: jest.fn(),
};
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
  $executeRaw: jest.fn(),
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
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    svc = mod.get(ToolExecutorService);
  });

  it('calls the tool directly and injects _tenantId/_userId (string)/_userDbId (number)/_role', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({
      providerClass: ToolClass,
      methodName: 'run',
    });
    const instance = {
      run: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    };
    mockModuleRef.get.mockReturnValue(instance);

    const principal = fromUser({ userId: 42, tenantId: 7, role: 'MEMBER' });
    const result = await svc.execute('query-records', { status: 'active' }, principal, { role: 'MEMBER' });

    // Tools receive the wire-format string userId (what `User.userId`
    // column stores and what VARCHAR audit columns expect), plus the
    // numeric DB id as `_userDbId` for FK joins.
    expect(instance.run).toHaveBeenCalledWith({
      status: 'active',
      _tenantId: 7,
      _userId: 'user_demo_owner',
      _userDbId: 42,
      _role: 'MEMBER',
      _conversationId: null,
    });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { userId: true },
    });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it("injects _conversationId from a chat principal, last, so a caller's copy never wins", async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({ providerClass: ToolClass, methodName: 'run' });
    const instance = { run: jest.fn().mockResolvedValue('ok') };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 42, tenantId: 7, role: 'MEMBER', conversationId: 'conv_mine' });

    await svc.execute('x', { _conversationId: 'conv_other' }, principal, { role: 'MEMBER' });

    expect(instance.run.mock.calls[0][0]._conversationId).toBe('conv_mine');
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
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });

    const result = await svc.execute('x', {}, principal);
    expect(result.content[0].text).toBe('bare-string');
  });

  it('the server identity params win over the same keys in args (spread last)', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({ providerClass: ToolClass, methodName: 'run' });
    const instance = { run: jest.fn().mockResolvedValue('ok') };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 42, tenantId: 7, role: 'MEMBER' });

    await svc.execute(
      'x',
      { _tenantId: 999, _userId: 'someone-else', _userDbId: 1, _role: 'OWNER', _conversationId: 'conv_other' },
      principal,
      { role: 'MEMBER' },
    );

    expect(instance.run).toHaveBeenCalledWith({
      _tenantId: 7,
      _userId: 'user_demo_owner',
      _userDbId: 42,
      _role: 'MEMBER',
      _conversationId: null,
    });
  });

  it('never hands the raw error message of a thrown non-HTTP error to the caller', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({ providerClass: ToolClass, methodName: 'run' });
    const instance = { run: jest.fn().mockRejectedValue(new Error('P2002 unique constraint on users.email')) };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });

    const result = await svc.execute('x', {}, principal);

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ error: TOOL_FAILED_MESSAGE, code: 'TOOL_FAILED' });
    expect(result.content[0].text).not.toMatch(/P2002/);
  });

  it('passes an HttpException message and its code through', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({ providerClass: ToolClass, methodName: 'run' });
    const instance = { run: jest.fn().mockRejectedValue(new NotFoundException('That ticket was not found')) };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });

    const result = await svc.execute('x', {}, principal);

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ error: 'That ticket was not found', code: 'NOT_FOUND' });
  });

  it('returns an isError result when the provider method throws', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({
      providerClass: ToolClass,
      methodName: 'run',
    });
    const instance = { run: jest.fn().mockRejectedValue(new Error('boom')) };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });

    const result = await svc.execute('x', {}, principal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toMatch(/boom/);
  });

  it('opens no transaction and switches no role around a tool call', async () => {
    const ToolClass = class {};
    mockScopeRegistry.resolveProvider.mockReturnValue({
      providerClass: ToolClass,
      methodName: 'run',
    });
    const instance = { run: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) };
    mockModuleRef.get.mockReturnValue(instance);
    const principal = fromUser({ userId: 42, tenantId: 7, role: 'MEMBER' });

    await svc.execute('query-records', {}, principal);

    expect(instance.run).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('returns isError when the tool is unknown and never resolves a provider', async () => {
    mockScopeRegistry.resolveProvider.mockReturnValue(undefined);
    const principal = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });
    const result = await svc.execute('unknown', {}, principal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Unknown tool/);
    expect(mockModuleRef.get).not.toHaveBeenCalled();
  });
});
