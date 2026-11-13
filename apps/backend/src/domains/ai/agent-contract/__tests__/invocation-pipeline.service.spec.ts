import { Test } from '@nestjs/testing';
import { InvocationPipelineService } from '../invocation-pipeline.service';
import { ScopeRegistryService } from '../scope-registry.service';
import { HitlPolicyService } from '../hitl-policy.service';
import { ToolExecutorService } from '../tool-executor.service';
import { AgentInvocationLoggerService } from '../agent-invocation-logger.service';
import { HitlChallengeService } from '../hitl-challenge.service';
import { ToolAccessPolicyService } from '../tool-access-policy.service';
import { fromUser, fromOAuthUser, fromDeskResponsibility, fromApiKey } from '@appshore/platform/auth/agent-principal';
import { z } from 'zod';
import { TOOL_FAILED_MESSAGE } from '../../mcp/tools/tool-error';
import { scopesForRole } from '../role-scopes';
import { intentDigest } from '../intent-digest';

const mockRegistry = {
  scopeForTool: jest.fn(),
  toolsAllowedByScopes: jest.fn(),
  parametersForTool: jest.fn(),
};
const mockPolicy = {
  actingRole: jest.fn(),
  checkRole: jest.fn(),
  checkPlan: jest.fn(),
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
    mockRegistry.parametersForTool.mockReturnValue(undefined);
    mockPolicy.actingRole.mockResolvedValue('MEMBER');
    mockPolicy.checkRole.mockReturnValue(null);
    mockPolicy.checkPlan.mockResolvedValue(null);
    const mod = await Test.createTestingModule({
      providers: [
        InvocationPipelineService,
        { provide: ScopeRegistryService, useValue: mockRegistry },
        { provide: HitlPolicyService, useValue: mockHitl },
        { provide: ToolExecutorService, useValue: mockExecutor },
        { provide: AgentInvocationLoggerService, useValue: mockLogger },
        { provide: HitlChallengeService, useValue: mockChallenges },
        { provide: ToolAccessPolicyService, useValue: mockPolicy },
      ],
    }).compile();
    svc = mod.get(InvocationPipelineService);
  });

  it('returns scope_denied when tool scope is not granted', async () => {
    mockRegistry.scopeForTool.mockReturnValue('platform:write:sensitive');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-records']));
    const p = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['platform:read'],
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
    const p = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });
    const res = await svc.run(p, 'nope', {});
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/unknown/i);
  });

  it('returns hitl_required for third-party standard write and issues a real token', async () => {
    mockRegistry.scopeForTool.mockReturnValue('platform:write');
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
      scopes: ['platform:write'],
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
        scopeRequired: 'platform:write',
        tier: 'standard',
      }),
    );
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('happy path: logs pending, executes, logs success, returns result', async () => {
    mockRegistry.scopeForTool.mockReturnValue('platform:read');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-records']));
    mockHitl.resolveTier.mockReturnValue('none');
    mockLogger.writePending.mockResolvedValue('row-1');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'result' }],
    });

    const p = fromUser({ userId: 42, tenantId: 7, role: 'MEMBER' });
    const res = await svc.run(p, 'query-records', { status: 'active' });

    expect(mockLogger.writePending).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'query-records',
        scopeRequired: 'platform:read',
        hitlTier: 'none',
      }),
    );
    expect(mockExecutor.execute).toHaveBeenCalledWith('query-records', { status: 'active' }, p, { role: 'MEMBER' });
    expect(mockLogger.completeSuccess).toHaveBeenCalledWith(expect.objectContaining({ rowId: 'row-1', tenantId: 7 }));
    expect(res.content[0].text).toBe('result');
  });

  it('executor error path: logs completeError, returns isError', async () => {
    mockRegistry.scopeForTool.mockReturnValue('platform:read');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['query-records']));
    mockHitl.resolveTier.mockReturnValue('none');
    mockLogger.writePending.mockResolvedValue('row-2');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'bad' }],
      isError: true,
    });

    const p = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });
    const res = await svc.run(p, 'query-records', {});

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
    mockRegistry.scopeForTool.mockReturnValue('platform:write:sensitive');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['void-invoice']));
    mockHitl.resolveTier.mockReturnValue('sensitive');
    mockLogger.writePending.mockResolvedValue('row-desk');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'voided' }],
    });

    const p = fromDeskResponsibility({
      responsibilityId: 5,
      tenantId: 7,
      scopes: ['platform:write:sensitive'],
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
    expect(mockExecutor.execute).toHaveBeenCalledWith('void-invoice', { id: 1 }, p, { role: 'MEMBER' });
    expect(mockLogger.completeSuccess).toHaveBeenCalled();
  });

  it('consumes _confirmToken and executes when valid', async () => {
    mockRegistry.scopeForTool.mockReturnValue('platform:write');
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
      scopes: ['platform:write'],
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
    mockRegistry.scopeForTool.mockReturnValue('platform:write');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['send-invoice']));
    mockHitl.resolveTier.mockReturnValue('standard');
    mockChallenges.consume.mockResolvedValue(null);

    const p = fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 1,
      role: 'ADMIN',
      scopes: ['platform:write'],
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
    mockRegistry.scopeForTool.mockReturnValue('platform:write');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['send-invoice']));
    mockHitl.resolveTier.mockReturnValue('standard');
    mockLogger.writePending.mockResolvedValue('row-1');
    mockExecutor.execute.mockResolvedValue({
      content: [{ type: 'text', text: 'sent' }],
    });

    const p = fromUser({ userId: 42, tenantId: 7, role: 'MEMBER' });
    await svc.run(p, 'send-invoice', { id: 1 });

    expect(mockChallenges.issue).not.toHaveBeenCalled();
    expect(mockChallenges.consume).not.toHaveBeenCalled();
    expect(mockExecutor.execute).toHaveBeenCalled();
  });

  describe('arguments (step 2)', () => {
    const schema = z.object({ subject: z.string().min(1), priority: z.enum(['LOW', 'HIGH']).default('LOW') });

    beforeEach(() => {
      mockRegistry.scopeForTool.mockReturnValue('platform:read');
      mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['t']));
      mockRegistry.parametersForTool.mockReturnValue(schema);
      mockHitl.resolveTier.mockReturnValue('none');
      mockLogger.writePending.mockResolvedValue('row');
      mockExecutor.execute.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    });

    it('refuses args that do not parse with VALIDATION_FAILED + fieldErrors; nothing runs or is logged', async () => {
      const p = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });
      const res = await svc.run(p, 't', { subject: 42 });
      expect(res.isError).toBe(true);
      const body = JSON.parse(res.content[0].text);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.fieldErrors).toHaveProperty('subject');
      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect(mockLogger.writePending).not.toHaveBeenCalled();
      expect(mockPolicy.checkRole).not.toHaveBeenCalled();
    });

    it('passes the parsed args (defaults applied, unknown keys dropped) and drops every `_` key the caller sent', async () => {
      const p = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });
      await svc.run(p, 't', { subject: 'Hi', extra: 'x', _tenantId: 999, _role: 'OWNER', _invocationSource: 'desk' });
      expect(mockExecutor.execute).toHaveBeenCalledWith('t', { subject: 'Hi', priority: 'LOW' }, p, {
        role: 'MEMBER',
      });
    });
  });

  describe('role and plan (steps 3 and 4) run before any confirmation', () => {
    const agent = () =>
      fromOAuthUser({ onBehalfOfUserDbId: 5, tenantDbId: 1, role: 'ADMIN', scopes: ['platform:write'], clientId: 'c' });
    const refusalOf = (status: string) => ({ content: [{ type: 'text', text: JSON.stringify({ status }) }] });

    beforeEach(() => {
      mockRegistry.scopeForTool.mockReturnValue('platform:write');
      mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['w']));
      mockHitl.resolveTier.mockReturnValue('standard');
    });

    it('a role refusal is a plain result (not isError); no challenge is issued and nothing runs', async () => {
      mockPolicy.checkRole.mockReturnValue(refusalOf('role_not_permitted'));
      const res = await svc.run(agent(), 'w', {});
      expect(res.isError).toBeFalsy();
      expect(res.content[0].text).toMatch(/role_not_permitted/);
      expect(mockChallenges.issue).not.toHaveBeenCalled();
      expect(mockChallenges.consume).not.toHaveBeenCalled();
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('a plan refusal is a plain result; no challenge is issued and nothing runs', async () => {
      mockPolicy.checkPlan.mockResolvedValue(refusalOf('not_on_plan'));
      const res = await svc.run(agent(), 'w', { _confirmToken: 'tok' });
      expect(res.isError).toBeFalsy();
      expect(res.content[0].text).toMatch(/not_on_plan/);
      expect(mockChallenges.issue).not.toHaveBeenCalled();
      expect(mockChallenges.consume).not.toHaveBeenCalled();
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('role and plan are judged with the acting role read for this principal', async () => {
      mockPolicy.actingRole.mockResolvedValue('ADMIN');
      mockChallenges.issue.mockResolvedValue({ token: 't', ttlSeconds: 300, stepUpRequired: false });
      const p = agent();
      await svc.run(p, 'w', {});
      expect(mockPolicy.actingRole).toHaveBeenCalledWith(p);
      expect(mockPolicy.checkRole).toHaveBeenCalledWith(p, 'w', 'ADMIN');
      expect(mockPolicy.checkPlan).toHaveBeenCalledWith(p, 'w', 'ADMIN');
    });

    it('an API key (deny by default) is challenged for a write', async () => {
      mockChallenges.issue.mockResolvedValue({ token: 't', ttlSeconds: 300, stepUpRequired: false });
      const p = fromApiKey({ apiKeyId: 3, tenantId: 1, userId: 5, scopes: ['platform:write'] });
      const res = await svc.run(p, 'w', {});
      expect(res.content[0].text).toMatch(/hitl_required/);
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });
  });

  describe('membership and the acting role (step 3, the real policy)', () => {
    const prisma = { workspaceMember: { findUnique: jest.fn() }, tenant: { findUnique: jest.fn() } };
    const registry = { ...mockRegistry, roleRestrictionForTool: jest.fn(), planFeatureForTool: jest.fn() };
    let real: InvocationPipelineService;

    beforeEach(() => {
      prisma.workspaceMember.findUnique.mockReset();
      registry.roleRestrictionForTool.mockReturnValue(undefined);
      registry.planFeatureForTool.mockReturnValue(undefined);
      const policy = new ToolAccessPolicyService(registry as any, prisma as any, { canActivate: jest.fn() } as any);
      real = new InvocationPipelineService(
        registry as any,
        mockHitl,
        mockExecutor as any,
        mockLogger as any,
        mockChallenges as any,
        policy,
      );
    });

    it('refuses an API key whose owner has no membership, on an unrestricted read', async () => {
      mockRegistry.scopeForTool.mockReturnValue('platform:read');
      mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['list-support-tickets']));
      mockHitl.resolveTier.mockReturnValue('none');
      prisma.workspaceMember.findUnique.mockResolvedValue(null);
      const key = fromApiKey({ apiKeyId: 2, tenantId: 3, userId: 12, scopes: ['platform:read'] });

      const res = await real.run(key, 'list-support-tickets', {});

      expect(res.isError).toBeFalsy();
      expect(JSON.parse(res.content[0].text)).toMatchObject({
        status: 'role_not_permitted',
        tool: 'list-support-tickets',
      });
      expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
        where: { userId_tenantId: { userId: 12, tenantId: 3 } },
        select: { role: true },
      });
      expect(mockLogger.writePending).not.toHaveBeenCalled();
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it("caps a chat persona's scopes at the user's current role: a MEMBER in a super_admin conversation", async () => {
      mockRegistry.scopeForTool.mockReturnValue('platform:write:sensitive');
      mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['void-invoice']));
      mockHitl.resolveTier.mockReturnValue('sensitive');
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'MEMBER' });
      // The persona picked by the client says SUPER_ADMIN; its scope set holds the sensitive write.
      const chat = fromUser({ userId: 4, tenantId: 9, role: 'SUPER_ADMIN', scopes: scopesForRole('SUPER_ADMIN') });

      const res = await real.run(chat, 'void-invoice', { id: 1 });

      expect(res.isError).toBe(true);
      expect(JSON.parse(res.content[0].text)).toMatchObject({
        error: 'scope_denied',
        required_scope: 'platform:write:sensitive',
      });
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('lets the same persona through when the current role holds the scope', async () => {
      mockRegistry.scopeForTool.mockReturnValue('platform:write:sensitive');
      mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['void-invoice']));
      mockHitl.resolveTier.mockReturnValue('sensitive');
      mockLogger.writePending.mockResolvedValue('row-o');
      mockExecutor.execute.mockResolvedValue({ content: [{ type: 'text', text: 'voided' }] });
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      const chat = fromUser({ userId: 4, tenantId: 9, role: 'OWNER', scopes: scopesForRole('OWNER') });

      const res = await real.run(chat, 'void-invoice', { id: 1 });

      expect(res.content[0].text).toBe('voided');
    });
  });

  describe('Desk at each tier', () => {
    it.each([
      ['platform:read', 'none'],
      ['platform:write', 'standard'],
      ['platform:write:sensitive', 'sensitive'],
    ] as const)('%s executes with no challenge and records tier %s in the audit row', async (scope, tier) => {
      const realTier = new HitlPolicyService();
      mockHitl.resolveTier.mockImplementation((s, pr) => realTier.resolveTier(s, pr));
      mockRegistry.scopeForTool.mockReturnValue(scope);
      mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['d']));
      mockLogger.writePending.mockResolvedValue('row');
      mockExecutor.execute.mockResolvedValue({ content: [{ type: 'text', text: 'done' }] });
      const p = fromDeskResponsibility({ responsibilityId: 1, tenantId: 7, scopes: [scope], enabledByUserId: 42 });

      const res = await svc.run(p, 'd', {});

      expect(res.content[0].text).toBe('done');
      expect(mockChallenges.issue).not.toHaveBeenCalled();
      expect(mockChallenges.consume).not.toHaveBeenCalled();
      expect(mockLogger.writePending).toHaveBeenCalledWith(expect.objectContaining({ hitlTier: tier }));
      mockHitl.resolveTier.mockReset();
    });
  });

  describe('the challenge digest (item 8a): exact arguments, every depth', () => {
    const writeSchema = z.object({
      invoice: z.object({ amount: z.number() }),
      to: z.string(),
      memo: z.string().default(''),
    });
    const agent = () =>
      fromOAuthUser({ onBehalfOfUserDbId: 5, tenantDbId: 1, role: 'ADMIN', scopes: ['platform:write'], clientId: 'c' });

    beforeEach(() => {
      mockRegistry.scopeForTool.mockReturnValue('platform:write');
      mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['send-invoice']));
      mockRegistry.parametersForTool.mockReturnValue(writeSchema);
      mockHitl.resolveTier.mockReturnValue('standard');
      mockChallenges.issue.mockResolvedValue({ token: 't', ttlSeconds: 600, stepUpRequired: false });
    });

    const issuedDigest = async (args: Record<string, unknown>) => {
      mockChallenges.issue.mockClear();
      await svc.run(agent(), 'send-invoice', args);
      return mockChallenges.issue.mock.calls[0][0].argsDigest as string;
    };

    it('issues the challenge over the intent digest of the call', async () => {
      const args = { invoice: { amount: 5 }, to: 'ap@example.com' };
      expect(await issuedDigest(args)).toBe(intentDigest(writeSchema, args));
    });

    it('a change inside a nested object needs a new challenge', async () => {
      const small = await issuedDigest({ invoice: { amount: 5 }, to: 'ap@example.com' });
      const large = await issuedDigest({ invoice: { amount: 500 }, to: 'ap@example.com' });
      expect(large).not.toBe(small);
    });

    it('a change inside a field the log redacts needs a new challenge', async () => {
      const approved = await issuedDigest({ invoice: { amount: 5 }, to: 'ap@example.com' });
      const swapped = await issuedDigest({ invoice: { amount: 5 }, to: 'attacker@example.com' });
      expect(swapped).not.toBe(approved);
    });

    it('the replay is checked against the exact digest, so swapped arguments cannot spend an approval', async () => {
      mockChallenges.consume.mockResolvedValue(null);
      await svc.run(agent(), 'send-invoice', {
        invoice: { amount: 500 },
        to: 'attacker@example.com',
        _confirmToken: 't',
      });
      expect(mockChallenges.consume).toHaveBeenCalledWith(
        't',
        expect.objectContaining({
          argsDigest: intentDigest(writeSchema, { invoice: { amount: 500 }, to: 'attacker@example.com' }),
        }),
      );
      expect(mockChallenges.consume.mock.calls[0][1].argsDigest).not.toBe(
        intentDigest(writeSchema, { invoice: { amount: 5 }, to: 'ap@example.com' }),
      );
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('a re-spelled replay of the same call (key order, explicit default) still matches', async () => {
      const issued = await issuedDigest({ to: 'ap@example.com', invoice: { amount: 5 } });
      mockChallenges.consume.mockResolvedValue({ id: 1 });
      mockLogger.writePending.mockResolvedValue('row');
      mockExecutor.execute.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      await svc.run(agent(), 'send-invoice', {
        memo: '',
        invoice: { amount: 5 },
        to: 'ap@example.com',
        _confirmToken: 't',
      });
      expect(mockChallenges.consume.mock.calls[0][1].argsDigest).toBe(issued);
      expect(mockExecutor.execute).toHaveBeenCalled();
    });
  });

  it('an executor throw is logged in full on the audit row and answered generically (step 7)', async () => {
    mockRegistry.scopeForTool.mockReturnValue('platform:read');
    mockRegistry.toolsAllowedByScopes.mockReturnValue(new Set(['q']));
    mockHitl.resolveTier.mockReturnValue('none');
    mockLogger.writePending.mockResolvedValue('row-x');
    mockExecutor.execute.mockRejectedValue(new Error('connection to 10.0.0.5 refused'));
    const p = fromUser({ userId: 1, tenantId: 1, role: 'MEMBER' });

    const res = await svc.run(p, 'q', {});

    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text)).toEqual({ error: TOOL_FAILED_MESSAGE, code: 'TOOL_FAILED' });
    expect(mockLogger.completeError).toHaveBeenCalledWith(
      expect.objectContaining({ rowId: 'row-x', error: 'connection to 10.0.0.5 refused' }),
    );
  });
});
