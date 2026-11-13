import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@appshore/db';
import { createMockOutbox } from '@appshore/platform/test/mocks/outbox.mock';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { AgentActionsService, APPROVED_RETRY_SECONDS, statusOf } from '../agent-actions.service';

/**
 * In-app approval of external agent writes (item 8c): who may see a request, approve or deny it, once; what it shows
 * (the exact arguments on an approval row, the redacted ones on a PIN row, never `argsPreview` there); the policy.
 */
describe('AgentActionsService', () => {
  const prisma = createMockPrisma();
  const outbox = createMockOutbox(prisma);
  const challenges = { callerOf: jest.fn() };
  let svc: AgentActionsService;

  const ACTED_FOR = 4;
  const member = { userDbId: ACTED_FOR, tenantId: 7, role: 'MEMBER' };
  const otherMember = { userDbId: 99, tenantId: 7, role: 'MEMBER' };
  const admin = { userDbId: 50, tenantId: 7, role: 'ADMIN' };

  const approvalRow = (over: Record<string, unknown> = {}) => ({
    id: 17,
    tenantId: 7,
    principalKind: 'oauth_client',
    principalId: 'oauth:claude',
    toolName: 'create-support-ticket',
    argsDigest: 'd'.repeat(64),
    scopeRequired: 'platform:write',
    tier: 'standard',
    stepUpRequired: false,
    stepUpUserId: ACTED_FOR,
    stepUpCompleted: false,
    conversationId: null,
    toolCallId: null,
    confirmedAt: null,
    approvalRequired: true,
    argsPreview: { subject: 'Printer', contactEmail: 'ada@example.com' },
    argsRedacted: null,
    approvedAt: null,
    deniedAt: null,
    decidedById: null,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    createdAt: new Date(),
    ...over,
  });
  const pinRow = (over: Record<string, unknown> = {}) =>
    approvalRow({
      tier: 'sensitive',
      scopeRequired: 'platform:write:sensitive',
      stepUpRequired: true,
      approvalRequired: false,
      argsPreview: { leaked: 'never shown' },
      argsRedacted: { subject: 'Printer', contactEmail: '[redacted-email]' },
      ...over,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    challenges.callerOf.mockResolvedValue({ kind: 'oauth_client', label: 'Claude' });
    prisma.user.findMany.mockResolvedValue([{ id: ACTED_FOR, email: 'ada@example.com' }]);
    prisma.user.findUnique.mockResolvedValue({ pinHash: 'hash' });
    svc = new AgentActionsService(prisma as never, outbox as never, challenges as never);
  });

  describe('get', () => {
    it('shows the person the agent acts for exactly what will run, and lets them decide', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(approvalRow());

      const action = await svc.get('17', member);

      expect(action).toMatchObject({
        token: '17',
        tool: 'create-support-ticket',
        tier: 'standard',
        status: 'PENDING',
        approvalRequired: true,
        stepUpRequired: false,
        caller: { kind: 'oauth_client', label: 'Claude' },
        onBehalfOf: 'ada@example.com',
        args: { subject: 'Printer', contactEmail: 'ada@example.com' },
        argsRedacted: false,
        canDecide: true,
        canStepUp: false,
        hasPinSet: true,
      });
      // Only this workspace's external-agent rows: never a chat grant, never a self-confirm token.
      expect(prisma.hitlChallenge.findFirst).toHaveBeenCalledWith({
        where: {
          id: 17,
          tenantId: 7,
          conversationId: null,
          OR: [{ approvalRequired: true }, { stepUpRequired: true }],
        },
      });
    });

    it('a PIN row returns the redacted arguments, never argsPreview, and offers the PIN to the person acted for only', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(pinRow());

      const mine = await svc.get('17', member);
      expect(mine).toMatchObject({
        tier: 'sensitive',
        stepUpRequired: true,
        approvalRequired: false,
        args: { subject: 'Printer', contactEmail: '[redacted-email]' },
        argsRedacted: true,
        canStepUp: true,
        canDecide: true,
      });
      expect(JSON.stringify(mine)).not.toContain('never shown');

      const theirs = await svc.get('17', admin);
      expect(theirs).toMatchObject({ canStepUp: false, canDecide: true });
    });

    it('says when the viewer has no PIN set', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(pinRow());
      prisma.user.findUnique.mockResolvedValue({ pinHash: null });
      expect(await svc.get('17', member)).toMatchObject({ hasPinSet: false, canStepUp: true });
    });

    it('is 404 for an unknown token, a malformed one, or another workspace request', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(null);
      await expect(svc.get('17', member)).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.get('not-a-token', member)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.hitlChallenge.findFirst).toHaveBeenCalledTimes(1);
    });

    it('is 403 for a member who is neither the person acted for nor an owner or admin (wrong viewer)', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(approvalRow());
      await expect(svc.get('17', otherMember)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a workspace admin see and decide for someone else', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(approvalRow());
      expect(await svc.get('17', admin)).toMatchObject({ canDecide: true });
    });
  });

  describe('decide', () => {
    it('approves once: a conditional write, the approved event in the same transaction, time left to retry', async () => {
      prisma.hitlChallenge.findFirst
        .mockResolvedValueOnce(approvalRow({ expiresAt: new Date(Date.now() + 60_000) }))
        .mockResolvedValueOnce(approvalRow({ approvedAt: new Date(), decidedById: ACTED_FOR }));
      prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });

      const action = await svc.decide('17', member, 'APPROVE');

      const { where, data } = prisma.hitlChallenge.updateMany.mock.calls[0][0];
      expect(where).toMatchObject({
        id: 17,
        tenantId: 7,
        conversationId: null,
        approvedAt: null,
        deniedAt: null,
        stepUpCompleted: false,
        consumedAt: null,
      });
      expect(data).toMatchObject({ approvedAt: expect.any(Date), decidedById: ACTED_FOR });
      expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now() + APPROVED_RETRY_SECONDS * 1000 - 1000);
      expect(outbox.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.AGENT_ACTION_APPROVED,
        '7',
        { token: '17', tool: 'create-support-ticket', caller: 'Claude' },
        { id: String(ACTED_FOR), type: 'user' },
      );
      // The event names the request, never its arguments.
      expect(JSON.stringify(outbox.emit.mock.calls[0])).not.toContain('ada@example.com');
      expect(action.status).toBe('APPROVED');
    });

    it('denies with deniedAt, drops the approver copy of the arguments, and raises the denied event', async () => {
      prisma.hitlChallenge.findFirst
        .mockResolvedValueOnce(approvalRow())
        .mockResolvedValueOnce(approvalRow({ deniedAt: new Date(), argsPreview: null }));
      prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });

      const action = await svc.decide('17', member, 'DENY');

      const { data } = prisma.hitlChallenge.updateMany.mock.calls[0][0];
      expect(data).toEqual({ deniedAt: expect.any(Date), decidedById: ACTED_FOR, argsPreview: Prisma.DbNull });
      expect(outbox.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.AGENT_ACTION_DENIED,
        '7',
        expect.objectContaining({ token: '17' }),
        expect.anything(),
      );
      expect(action).toMatchObject({ status: 'DENIED', args: {} });
    });

    it('a PIN row can be denied, but never approved with the button', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(pinRow());
      const refused = await svc.decide('17', member, 'APPROVE').catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(ConflictException);
      expect((refused as ConflictException).getResponse()).toMatchObject({ code: 'INVALID_STATE' });
      expect(prisma.hitlChallenge.updateMany).not.toHaveBeenCalled();

      prisma.hitlChallenge.findFirst
        .mockResolvedValueOnce(pinRow())
        .mockResolvedValueOnce(pinRow({ deniedAt: new Date() }));
      prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });
      expect(await svc.decide('17', member, 'DENY')).toMatchObject({ status: 'DENIED' });
    });

    it('is 409 for a second decision, an expired request, or a used one', async () => {
      for (const row of [
        approvalRow({ approvedAt: new Date() }),
        approvalRow({ deniedAt: new Date() }),
        approvalRow({ expiresAt: new Date(Date.now() - 1000) }),
        approvalRow({ consumedAt: new Date() }),
        pinRow({ stepUpCompleted: true }),
      ]) {
        prisma.hitlChallenge.findFirst.mockResolvedValueOnce(row);
        await expect(svc.decide('17', member, 'DENY')).rejects.toBeInstanceOf(ConflictException);
      }
      expect(prisma.hitlChallenge.updateMany).not.toHaveBeenCalled();
      expect(outbox.emit).not.toHaveBeenCalled();
    });

    it('is 409 STALE when someone decided between the read and the write, and raises no event', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue(approvalRow());
      prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 0 });
      const error = await svc.decide('17', member, 'APPROVE').catch((e: unknown) => e);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'STALE' });
      expect(outbox.emit).not.toHaveBeenCalled();
    });

    it('is 403 for a member who may not decide, and 404 for another workspace', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValueOnce(approvalRow());
      await expect(svc.decide('17', otherMember, 'APPROVE')).rejects.toBeInstanceOf(ForbiddenException);
      prisma.hitlChallenge.findFirst.mockResolvedValueOnce(null);
      await expect(svc.decide('17', { ...admin, tenantId: 8 }, 'APPROVE')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.hitlChallenge.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('policy', () => {
    it('reads the workspace switch (404 for a missing workspace)', async () => {
      prisma.tenant.findUnique.mockResolvedValueOnce({ agentSelfConfirm: false }).mockResolvedValueOnce(null);
      expect(await svc.getPolicy(7)).toEqual({ selfConfirm: false });
      await expect(svc.getPolicy(7)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('flips it with its event in the same transaction', async () => {
      prisma.tenant.update.mockResolvedValue({ agentSelfConfirm: true });
      const actor = { id: '1', type: 'user' as const };

      expect(await svc.setPolicy(7, true, actor)).toEqual({ selfConfirm: true });
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { agentSelfConfirm: true },
        select: { agentSelfConfirm: true },
      });
      expect(outbox.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.WORKSPACE_AGENT_POLICY_CHANGED,
        '7',
        { selfConfirm: true },
        actor,
      );
    });
  });

  it('statusOf derives the status: used, then denied, then expired, then approved (button or PIN), else pending', () => {
    const base = {
      approvedAt: null,
      deniedAt: null,
      consumedAt: null,
      stepUpRequired: false,
      stepUpCompleted: false,
      expiresAt: new Date(Date.now() + 60_000),
    };
    expect(statusOf(base)).toBe('PENDING');
    expect(statusOf({ ...base, approvedAt: new Date() })).toBe('APPROVED');
    expect(statusOf({ ...base, stepUpRequired: true, stepUpCompleted: true })).toBe('APPROVED');
    expect(statusOf({ ...base, approvedAt: new Date(), expiresAt: new Date(Date.now() - 1) })).toBe('EXPIRED');
    expect(statusOf({ ...base, deniedAt: new Date(), expiresAt: new Date(Date.now() - 1) })).toBe('DENIED');
    expect(statusOf({ ...base, consumedAt: new Date(), deniedAt: new Date() })).toBe('USED');
  });
});
