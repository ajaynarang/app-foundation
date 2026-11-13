import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MCP_TOOL_METADATA_KEY, Tool, type McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import { z } from 'zod';
import { TenantPlan, UserRole } from '@appshore/db';
import { PlanGuard } from '@appshore/platform/auth/guards/plan.guard';
import { fromApiKey, fromOAuthUser, fromUser } from '@appshore/platform/auth/agent-principal';
import { InvocationPipelineService } from '../../../agent-contract/invocation-pipeline.service';
import { ScopeRegistryService } from '../../../agent-contract/scope-registry.service';
import { HitlPolicyService } from '../../../agent-contract/hitl-policy.service';
import { ToolExecutorService } from '../../../agent-contract/tool-executor.service';
import { ToolAccessPolicyService } from '../../../agent-contract/tool-access-policy.service';
import { RequiresScope } from '../../../agent-contract/requires-scope.decorator';
import { RequiresPlanFeature } from '../../../agent-contract/tool-policy.decorator';
import { SupportTicketTool } from '../support-ticket.tool';
import { TOOL_FAILED_MESSAGE } from '../tool-error';

/**
 * The example pair walked through every step of the pipeline, end to end: scope, arguments, role, plan,
 * confirmation, audit and execute, errors. Real registry, policy, PlanGuard, HITL tiers and executor; the database,
 * the plan lookup, the audit log and the challenge store are mocked.
 *
 * The support REST twin has no plan feature, so the plan step is exercised by a spec-only fixture tool.
 */
@Injectable()
class PlanGatedFixtureTool {
  @RequiresScope('platform:read')
  @RequiresPlanFeature('webhooks')
  @Tool({ name: 'plan-gated-fixture', description: 'fixture', parameters: z.object({}) })
  run() {
    return { ran: true };
  }
}

const TICKET = {
  ticketNumber: 'ST-1001',
  subject: 'Printer on fire',
  status: 'OPEN',
  category: 'TECHNICAL',
  priority: 'HIGH',
  messageCount: 0,
  createdAt: new Date('2026-11-13T00:00:00Z'),
};

function mcpRegistryFor(...classes: Array<new (...args: never[]) => object>): McpRegistryDiscoveryService {
  const tools = classes.flatMap((cls) =>
    Object.getOwnPropertyNames(cls.prototype)
      .filter((m) => m !== 'constructor')
      .map((methodName) => {
        const handler = (cls.prototype as Record<string, object>)[methodName];
        const meta = Reflect.getMetadata(MCP_TOOL_METADATA_KEY, handler) as
          | { name: string; parameters?: unknown }
          | undefined;
        return meta ? { metadata: meta, providerClass: cls, methodName } : null;
      })
      .filter((t): t is NonNullable<typeof t> => t !== null),
  );
  return { getMcpModuleIds: () => ['m'], getTools: () => tools } as unknown as McpRegistryDiscoveryService;
}

describe('example tool pair through the whole pipeline', () => {
  const support = { listTicketsForTenant: jest.fn(), createTicket: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  const plans = { getTenantPlan: jest.fn(), isFeatureEnabled: jest.fn() };
  const audit = { writePending: jest.fn(), completeSuccess: jest.fn(), completeError: jest.fn() };
  const challenges = {
    issue: jest.fn(),
    consume: jest.fn(),
    consumeChatGrant: jest.fn(),
    tenantAllowsSelfConfirm: jest.fn(),
  };
  let pipeline: InvocationPipelineService;

  beforeAll(async () => {
    const registry = new ScopeRegistryService(mcpRegistryFor(SupportTicketTool, PlanGatedFixtureTool));
    await registry.discoverTools();
    const instances = new Map<unknown, object>([
      [SupportTicketTool, new SupportTicketTool(support as never)],
      [PlanGatedFixtureTool, new PlanGatedFixtureTool()],
    ]);
    const moduleRef = { get: (token: unknown) => instances.get(token) };
    const planGuard = new PlanGuard(
      new Reflector(),
      plans as never,
      { isEnabled: jest.fn().mockResolvedValue(true) } as never,
      { get: jest.fn().mockReturnValue({ enabled: true }) } as never,
    );
    pipeline = new InvocationPipelineService(
      registry,
      new HitlPolicyService(),
      new ToolExecutorService(registry, moduleRef as never, prisma as never),
      audit as never,
      challenges as never,
      new ToolAccessPolicyService(registry, prisma as never, planGuard),
      { get: () => undefined } as never,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ userId: 'user_wire_5' });
    prisma.workspaceMember.findUnique.mockResolvedValue({ role: UserRole.MEMBER });
    prisma.tenant.findUnique.mockResolvedValue({ tenantId: 'tenant_wire_7' });
    audit.writePending.mockResolvedValue('row-1');
    support.createTicket.mockResolvedValue(TICKET);
    support.listTicketsForTenant.mockResolvedValue({ items: [TICKET], nextCursor: null, total: 1 });
    // The member in chat has confirmed the card for the write under test, unless a case says otherwise.
    challenges.consumeChatGrant.mockResolvedValue('grant-1');
  });

  const body = (res: { content: Array<{ text: string }> }) => JSON.parse(res.content[0].text);
  const member = () =>
    fromUser({
      userId: 5,
      tenantId: 7,
      role: 'MEMBER',
      scopes: ['platform:read', 'platform:write'],
      conversationId: 'conv_1',
    });
  const agent = () =>
    fromOAuthUser({ onBehalfOfUserDbId: 5, tenantDbId: 7, role: 'ADMIN', scopes: ['platform:write'], clientId: 'c' });
  const createArgs = { subject: 'Printer on fire', description: 'Smoke from tray 2' };

  it('step 1, scope: a key that holds only platform:read cannot create', async () => {
    const readKey = fromApiKey({ apiKeyId: 1, tenantId: 7, userId: 5, scopes: ['platform:read'] });
    const res = await pipeline.run(readKey, 'create-support-ticket', createArgs);
    expect(body(res).error).toBe('scope_denied');
    expect(support.createTicket).not.toHaveBeenCalled();
  });

  it('step 2, arguments: a missing subject is VALIDATION_FAILED and nothing runs', async () => {
    const res = await pipeline.run(member(), 'create-support-ticket', { description: 'x' });
    expect(res.isError).toBe(true);
    expect(body(res)).toMatchObject({ code: 'VALIDATION_FAILED', fieldErrors: { subject: expect.any(String) } });
    expect(support.createTicket).not.toHaveBeenCalled();
    expect(audit.writePending).not.toHaveBeenCalled();
  });

  it('step 3, role: a person with no membership in this workspace is refused before any challenge', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue(null);
    const res = await pipeline.run(agent(), 'create-support-ticket', createArgs);
    expect(res.isError).toBeFalsy();
    expect(body(res).status).toBe('role_not_permitted');
    expect(challenges.issue).not.toHaveBeenCalled();
    expect(support.createTicket).not.toHaveBeenCalled();
  });

  it('step 4, plan: the plan-gated fixture is refused on Starter and runs on Professional', async () => {
    plans.getTenantPlan.mockResolvedValue(TenantPlan.STARTER);
    plans.isFeatureEnabled.mockImplementation((plan: string) => Promise.resolve(plan !== TenantPlan.STARTER));
    const refused = await pipeline.run(member(), 'plan-gated-fixture', {});
    expect(body(refused)).toMatchObject({ status: 'not_on_plan', reason: 'PLAN_UPGRADE_REQUIRED' });
    expect(plans.getTenantPlan).toHaveBeenCalledWith('tenant_wire_7');

    plans.getTenantPlan.mockResolvedValue(TenantPlan.PROFESSIONAL);
    const ran = await pipeline.run(member(), 'plan-gated-fixture', {});
    expect(body(ran)).toEqual({ ran: true });
  });

  it('step 5, confirmation: an external agent waits for a person, then runs once it replays the approved token', async () => {
    challenges.tenantAllowsSelfConfirm.mockResolvedValue(false);
    challenges.issue.mockResolvedValue({
      token: 'tok-1',
      ttlSeconds: 3600,
      stepUpRequired: false,
      approvalRequired: true,
    });
    const first = await pipeline.run(agent(), 'create-support-ticket', createArgs);
    expect(body(first)).toMatchObject({ status: 'approval_required', token: 'tok-1' });
    // The approver is shown exactly the arguments that will run.
    expect(challenges.issue.mock.calls[0][0]).toMatchObject({ approvalRequired: true, argsPreview: createArgs });
    expect(support.createTicket).not.toHaveBeenCalled();

    challenges.consume.mockResolvedValueOnce({ ok: false, reason: 'pending' });
    const early = await pipeline.run(agent(), 'create-support-ticket', { ...createArgs, _confirmToken: 'tok-1' });
    expect(body(early)).toMatchObject({ error: 'approval_pending' });
    expect(support.createTicket).not.toHaveBeenCalled();
    challenges.consume.mockClear();

    challenges.consume.mockResolvedValue({ ok: true, row: { id: 1 } });
    const second = await pipeline.run(agent(), 'create-support-ticket', { ...createArgs, _confirmToken: 'tok-1' });
    expect(challenges.consume).toHaveBeenCalledWith(
      'tok-1',
      expect.objectContaining({ toolName: 'create-support-ticket', principalId: 'oauth:c' }),
    );
    // The digest the replay is checked against is the one the challenge was issued for.
    expect(challenges.consume.mock.calls[0][1].argsDigest).toBe(challenges.issue.mock.calls[0][0].argsDigest);
    expect(body(second)).toMatchObject({ created: true, ticket: { ticketNumber: 'ST-1001' } });
  });

  it('step 5, confirmation in chat: a member writes only against the card they confirmed for these exact arguments', async () => {
    challenges.consumeChatGrant.mockResolvedValue(null);
    const unconfirmed = await pipeline.run(member(), 'create-support-ticket', createArgs);
    expect(body(unconfirmed)).toMatchObject({ status: 'confirmation_required', tool: 'create-support-ticket' });
    expect(support.createTicket).not.toHaveBeenCalled();
    expect(audit.writePending).not.toHaveBeenCalled();

    challenges.consumeChatGrant.mockResolvedValue('grant-1');
    const confirmed = await pipeline.run(member(), 'create-support-ticket', createArgs);
    expect(challenges.consumeChatGrant).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: 7, userId: 5, conversationId: 'conv_1', toolName: 'create-support-ticket' }),
    );
    expect(body(confirmed)).toMatchObject({ created: true });
    expect(audit.writePending).toHaveBeenCalledWith(expect.objectContaining({ confirmationTokenId: 'grant-1' }));
    expect(challenges.issue).not.toHaveBeenCalled();
  });

  it('step 6, audit and execute: the write is logged at its tier and runs with the server identity only', async () => {
    const res = await pipeline.run(member(), 'create-support-ticket', {
      ...createArgs,
      _tenantId: 999,
      _userDbId: 1,
    });
    expect(body(res).created).toBe(true);
    expect(audit.writePending).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'create-support-ticket',
        hitlTier: 'standard',
        scopeRequired: 'platform:write',
      }),
    );
    expect(audit.completeSuccess).toHaveBeenCalledWith(expect.objectContaining({ rowId: 'row-1' }));
    expect(support.createTicket).toHaveBeenCalledWith(7, 5, {
      subject: 'Printer on fire',
      description: 'Smoke from tray 2',
      category: 'GENERAL',
      priority: 'MEDIUM',
    });
  });

  it('the read lists this workspace only, whatever _tenantId the caller sends', async () => {
    const res = await pipeline.run(member(), 'list-support-tickets', { _tenantId: 999 });
    expect(body(res)).toMatchObject({ total: 1, tickets: [{ ticketNumber: 'ST-1001' }] });
    expect(support.listTicketsForTenant).toHaveBeenCalledWith(7, { status: undefined, limit: 10, cursor: undefined });
  });

  it('step 7, errors: a service failure reaches the caller as the generic message, logged on the audit row', async () => {
    support.createTicket.mockRejectedValue(new Error('sequence support_ticket_seq does not exist'));
    const res = await pipeline.run(member(), 'create-support-ticket', createArgs);
    expect(res.isError).toBe(true);
    expect(body(res)).toEqual({ error: TOOL_FAILED_MESSAGE, code: 'TOOL_FAILED' });
    expect(audit.completeError).toHaveBeenCalled();
  });
});
