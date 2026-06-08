import { Test } from '@nestjs/testing';
import { InvocationPipelineService } from '../invocation-pipeline.service';
import { ScopeRegistryService } from '../scope-registry.service';
import { HitlPolicyService } from '../hitl-policy.service';
import { ToolExecutorService } from '../tool-executor.service';
import { AgentInvocationLoggerService } from '../agent-invocation-logger.service';
import { HitlChallengeService } from '../hitl-challenge.service';
import { fromUser, fromOAuthUser, fromDeskResponsibility } from '../agent-principal';

const mockRegistry = {
  scopeForTool: jest.fn(),
  toolsAllowedByScopes: jest.fn(),
};
const mockHitl = {
  resolveTier: jest.fn(),
  tokenTtlSeconds: jest.fn().mockReturnValue(300),
};
const mockExecutor = { execute: jest.fn() };
const mockLogger = {
  writePending: jest.fn(),
  completeSuccess: jest.fn(),
  completeError: jest.fn(),
};
const mockChallenges = {
  issue: jest.fn(),
  consume: jest.fn(),
};

describe('InvocationPipelineService', () => {
  let svc: InvocationPipelineService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockHitl.tokenTtlSeconds.mockReturnValue(300);
    mockChallenges.issue.mockReset();
    mockChallenges.consume.mockReset();
    const mod = await Test.createTestingModule({
      providers: [
        InvocationPipelineService,
        { provide: ScopeRegistryService, useValue: mockRegistry },
        { provide: HitlPolicyService, useValue: mockHitl },
        { provide: ToolExecutorService, useValue: mockExecutor },
        { provide: AgentInvocationLoggerService, useValue: mockLogger },
        { provide: HitlChallengeService, useValue: mockChallenges },
      ],
    }).compile();
    svc = mod.get(InvocationPipelineService);
  });

  it('returns scope_denied when tool scope is not granted', async () => {
    mockRegistry.scopeForTool.mockReturnValue('invoices:write:sensitive');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-loads']));
    const p = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['fleet:read'],
      clientId: 'c',
    });
    const res = await svc.run(p, 'void-invoice', { id: 1 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/scope_denied/);
    expect(mockLogger.writePending).not.toHaveBeenCalled();
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('returns unknown-tool error when scopeForTool is undefined', async () => {
    mockRegistry.scopeForTool.mockReturnValue(undefined);
    const p = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });
    const res = await svc.run(p, 'nope', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/unknown/i);
  });

  it('returns hitl_required for third-party standard write and issues a real token', async () => {
    mockRegistry.scopeForTool.mockReturnValue('invoices:write');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['send-invoice']));
    mockHitl.resolveTier.mockReturnValue('standard');
    mockChallenges.issue.mockResolvedValue({
      token: 'tok-1',
      ttlSeconds: 300,
      stepUpRequired: false,
    });

    const p = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['invoices:write'],
      clientId: 'c',
    });
    const res = await svc.run(p, 'send-invoice', { id: 1 });

    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toMatch(/hitl_required/);
    expect(res.content[0].text).toContain('"token":"tok-1"');
    expect(res.content[0].text).toContain('"ttlSeconds":300');
    expect(res.content[0].text).toContain('"stepUpRequired":false');
    expect(mockChallenges.issue).toHaveBeenCalledWith(
      expect.objectContaining({
        principal: p,
        toolName: 'send-invoice',
        scopeRequired: 'invoices:write',
        tier: 'standard',
      }),
    );
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('happy path: logs pending, executes, logs success, returns result', async () => {
    mockRegistry.scopeForTool.mockReturnValue('fleet:read');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-loads']));
    mockHitl.resolveTier.mockReturnValue('none');
    mockLogger.writePending.mockResolvedValue('row-1');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'result' }],
    });

    const p = fromUser({ userId: 42, tenantId: 7, role: 'DISPATCHER' });
    const res = await svc.run(p, 'query-loads', { status: 'active' });

    expect(mockLogger.writePending).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'query-loads',
        scopeRequired: 'fleet:read',
        hitlTier: 'none',
      }),
    );
    expect(mockExecutor.execute).toHaveBeenCalledWith('query-loads', { status: 'active' }, p);
    expect(mockLogger.completeSuccess).toHaveBeenCalledWith(expect.objectContaining({ rowId: 'row-1', tenantId: 7 }));
    expect(res.content[0].text).toBe('result');
  });

  it('executor error path: logs completeError, returns isError', async () => {
    mockRegistry.scopeForTool.mockReturnValue('fleet:read');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-loads']));
    mockHitl.resolveTier.mockReturnValue('none');
    mockLogger.writePending.mockResolvedValue('row-2');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'bad' }],
      isError: true,
    });

    const p = fromUser({ userId: 1, tenantId: 1, role: 'DISPATCHER' });
    const res = await svc.run(p, 'query-loads', {});

    expect(mockLogger.completeError).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: 'row-2', tenantId: 1, error: 'bad' }),
    );
    expect(res.isError).toBe(true);
  });

  it('blocks platform:admin scope for non-user principals', async () => {
    mockRegistry.scopeForTool.mockReturnValue('platform:admin');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['some-admin-tool']));
    const p = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['platform:admin'],
      clientId: 'c',
    });
    const res = await svc.run(p, 'some-admin-tool', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/scope_denied/);
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('desk_responsibility on sensitive write skips the hitl_required sentinel and executes', async () => {
    mockRegistry.scopeForTool.mockReturnValue('invoices:write:sensitive');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['void-invoice']));
    mockHitl.resolveTier.mockReturnValue('sensitive');
    mockLogger.writePending.mockResolvedValue('row-desk');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'voided' }],
    });

    const p = fromDeskResponsibility({
      responsibilityId: 5,
      tenantId: 7,
      scopes: ['invoices:write:sensitive'],
      enabledByUserId: 42,
    });
    const res = await svc.run(p, 'void-invoice', { id: 1 });

    expect(res.content[0].text).toBe('voided');
    expect(mockLogger.writePending).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'void-invoice',
        hitlTier: 'sensitive',
      }),
    );
    expect(mockExecutor.execute).toHaveBeenCalledWith('void-invoice', { id: 1 }, p);
    expect(mockLogger.completeSuccess).toHaveBeenCalled();
  });

  it('consumes _confirmToken and executes when valid', async () => {
    mockRegistry.scopeForTool.mockReturnValue('invoices:write');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['send-invoice']));
    mockHitl.resolveTier.mockReturnValue('standard');
    mockChallenges.consume.mockResolvedValue({ id: 'tok-1', tier: 'standard' });
    mockLogger.writePending.mockResolvedValue('row-1');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'sent' }],
    });

    const p = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['invoices:write'],
      clientId: 'c',
    });
    const res = await svc.run(p, 'send-invoice', {
      id: 1,
      _confirmToken: 'tok-1',
    });

    expect(mockChallenges.consume).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({
        principalId: 'oauth:c',
        toolName: 'send-invoice',
      }),
    );
    expect(mockExecutor.execute).toHaveBeenCalled();
    expect(mockLogger.writePending).toHaveBeenCalledWith(expect.objectContaining({ confirmationTokenId: 'tok-1' }));
    expect(res.content[0].text).toBe('sent');
  });

  it('rejects invalid/expired _confirmToken with hitl_invalid_or_expired', async () => {
    mockRegistry.scopeForTool.mockReturnValue('invoices:write');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['send-invoice']));
    mockHitl.resolveTier.mockReturnValue('standard');
    mockChallenges.consume.mockResolvedValue(null);

    const p = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['invoices:write'],
      clientId: 'c',
    });
    const res = await svc.run(p, 'send-invoice', {
      id: 1,
      _confirmToken: 'bad-token',
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/hitl_invalid_or_expired/);
    expect(mockExecutor.execute).not.toHaveBeenCalled();
    expect(mockLogger.writePending).not.toHaveBeenCalled();
  });

  it('does not call challenges.issue/consume for user principals (chat stays on inline-confirm UI path)', async () => {
    mockRegistry.scopeForTool.mockReturnValue('invoices:write');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['send-invoice']));
    mockHitl.resolveTier.mockReturnValue('standard');
    mockLogger.writePending.mockResolvedValue('row-1');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'sent' }],
    });

    const p = fromUser({ userId: 42, tenantId: 7, role: 'DISPATCHER' });
    await svc.run(p, 'send-invoice', { id: 1 });

    expect(mockChallenges.issue).not.toHaveBeenCalled();
    expect(mockChallenges.consume).not.toHaveBeenCalled();
    expect(mockExecutor.execute).toHaveBeenCalled();
  });
});
