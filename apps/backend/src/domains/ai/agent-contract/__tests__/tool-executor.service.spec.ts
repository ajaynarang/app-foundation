import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TOOL_FAILED_MESSAGE } from '../../mcp/tools/tool-error';
import { ToolExecutorService } from '../tool-executor.service';
import { ScopeRegistryService } from '../scope-registry.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { ModuleRef } from '@nestjs/core';
import { fromApiKey, fromUser } from '@appshore/platform/auth/agent-principal';
import { IdempotencyStore } from '@appshore/platform/infrastructure/idempotency/idempotency.store';
import { z } from 'zod';
import { validateToolArgs } from '../tool-args';
import { idempotencyKeyArg } from '../tool-idempotency';

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

// A real IdempotencyStore over an in-memory cache, so claim, replay, reuse and release are the store's own.
const cacheData = new Map<string, unknown>();
const idempotency = new IdempotencyStore({
  claim: async (k: string, v: unknown) => (cacheData.has(k) ? false : (cacheData.set(k, v), true)),
  get: async (k: string) => cacheData.get(k),
  set: async (k: string, v: unknown) => void cacheData.set(k, v),
  del: async (k: string) => void cacheData.delete(k),
} as never);

describe('ToolExecutorService', () => {
  let svc: ToolExecutorService;

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheData.clear();
    mockPrisma.user.findUnique.mockResolvedValue({ userId: 'user_demo_owner' });
    const mod = await Test.createTestingModule({
      providers: [
        ToolExecutorService,
        { provide: ScopeRegistryService, useValue: mockScopeRegistry },
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdempotencyStore, useValue: idempotency },
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
  describe('idempotencyKey (retry-safe creates)', () => {
    const parameters = z.object({ title: z.string(), idempotencyKey: idempotencyKeyArg });
    const principal = fromUser({ userId: 1, tenantId: 9, role: 'MEMBER' });
    let run: jest.Mock;

    beforeEach(() => {
      run = jest.fn().mockResolvedValue({ created: true, ref: 'R-1' });
      mockScopeRegistry.resolveProvider.mockReturnValue({ providerClass: class {}, methodName: 'run', parameters });
      mockModuleRef.get.mockReturnValue({ run });
    });

    it('runs once and replays the first result for the same key and arguments; the tool never sees the key', async () => {
      const first = await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-1' }, principal);
      const second = await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-1' }, principal);
      expect(second).toEqual(first);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0][0]).not.toHaveProperty('idempotencyKey');
    });

    it('the same key with different arguments is IDEMPOTENCY_KEY_REUSED, and the tool does not run again', async () => {
      await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-1' }, principal);
      const reused = await svc.execute('create-thing', { title: 'B', idempotencyKey: 'k-1' }, principal);
      expect(reused.isError).toBe(true);
      expect(JSON.parse(reused.content[0].text)).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('the same key on another tool is IDEMPOTENCY_KEY_REUSED', async () => {
      await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-1' }, principal);
      const other = await svc.execute('create-other', { title: 'A', idempotencyKey: 'k-1' }, principal);
      expect(JSON.parse(other.content[0].text)).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('a failed call is not remembered: the retry runs again', async () => {
      run.mockRejectedValueOnce(new Error('db down'));
      expect((await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-2' }, principal)).isError).toBe(true);
      expect(
        (await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-2' }, principal)).isError,
      ).toBeUndefined();
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('a retry while the first call is still running is IDEMPOTENCY_KEY_IN_USE and does not run', async () => {
      let finish: (value: unknown) => void = () => undefined;
      run.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
      const first = svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-6' }, principal);
      await new Promise((resolve) => setImmediate(resolve));
      const second = await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-6' }, principal);
      expect(JSON.parse(second.content[0].text)).toMatchObject({ code: 'IDEMPOTENCY_KEY_IN_USE' });
      finish({ created: true });
      await first;
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('a replay answers only the same person: another user in the workspace with the same key runs anew', async () => {
      await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-3' }, principal);
      await svc.execute(
        'create-thing',
        { title: 'A', idempotencyKey: 'k-3' },
        fromUser({ userId: 2, tenantId: 9, role: 'MEMBER' }),
      );
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('a replay never crosses workspaces: the same person and key in another workspace runs anew', async () => {
      await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-7' }, principal);
      await svc.execute(
        'create-thing',
        { title: 'A', idempotencyKey: 'k-7' },
        fromUser({ userId: 1, tenantId: 10, role: 'MEMBER' }),
      );
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("an API key acting for the same person shares that person's keys", async () => {
      await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-8' }, principal);
      const viaKey = await svc.execute(
        'create-thing',
        { title: 'A', idempotencyKey: 'k-8' },
        fromApiKey({ apiKeyId: 3, tenantId: 9, userId: 1, scopes: ['platform:write'] }),
      );
      expect(viaKey.isError).toBeUndefined();
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('fails open: an unreachable store runs the call, and a store error after it ran never fails it', async () => {
      const claim = jest.spyOn(idempotency, 'claim').mockRejectedValueOnce(new Error('ECONNREFUSED'));
      expect(
        (await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-4' }, principal)).isError,
      ).toBeUndefined();
      claim.mockResolvedValueOnce({
        kind: 'run',
        complete: jest.fn().mockRejectedValue(new Error('gone')),
        release: jest.fn(),
      });
      expect(
        (await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-5' }, principal)).isError,
      ).toBeUndefined();
      expect(run).toHaveBeenCalledTimes(2);
      claim.mockRestore();
    });

    it('without a key every call runs and the store is never asked', async () => {
      const claim = jest.spyOn(idempotency, 'claim');
      await svc.execute('create-thing', { title: 'A' }, principal);
      await svc.execute('create-thing', { title: 'A' }, principal);
      expect(run).toHaveBeenCalledTimes(2);
      expect(claim).not.toHaveBeenCalled();
      claim.mockRestore();
    });

    it('a tool that does not declare the key gets no replay', async () => {
      mockScopeRegistry.resolveProvider.mockReturnValue({
        providerClass: class {},
        methodName: 'run',
        parameters: z.object({ title: z.string() }),
      });
      await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-9' }, principal);
      await svc.execute('create-thing', { title: 'A', idempotencyKey: 'k-9' }, principal);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('a malformed key never reaches the executor: argument validation names idempotencyKey', () => {
      const bad = validateToolArgs(parameters, { title: 'A', idempotencyKey: 'has space' });
      expect('failure' in bad && bad.failure).toMatchObject({
        code: 'VALIDATION_FAILED',
        fieldErrors: { idempotencyKey: expect.any(String) },
      });
    });
  });
});
