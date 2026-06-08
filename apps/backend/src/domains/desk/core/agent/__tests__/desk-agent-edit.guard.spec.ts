import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import type { ExecutionContext } from '@nestjs/common';

import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';

import { DeskAgentEditGuard } from '../desk-agent-edit.guard';

function makeCtx(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('DeskAgentEditGuard', () => {
  let guard: DeskAgentEditGuard;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const moduleRef = await Test.createTestingModule({
      providers: [DeskAgentEditGuard, { provide: PrismaService, useValue: prisma }],
    }).compile();
    guard = moduleRef.get(DeskAgentEditGuard);
  });

  // ─── Bypass roles ────────────────────────────────────────────────

  it.each([UserRole.OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN])('allows %s without hitting Prisma', async (role) => {
    const ctx = makeCtx({
      user: { dbId: 1, role, tenantId: 't1' },
      route: { path: '/desk/agents/:key' },
      params: { key: 'assistant' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.deskAgent.findUnique).not.toHaveBeenCalled();
    expect(prisma.deskAgent.findFirst).not.toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  // ─── Unauthorized access ─────────────────────────────────────────
  // With the genericized role set (OWNER/ADMIN/MEMBER/SUPER_ADMIN), OWNER/
  // ADMIN/SUPER_ADMIN bypass and MEMBER is supervisor-conditional. There is no
  // flatly-denied-by-role case anymore, so the denial paths exercised below are
  // "no user", "no tenant", and "not the supervisor".

  it('denies when no user on request', async () => {
    const ctx = makeCtx({
      route: { path: '/desk/agents/:key' },
      params: { key: 'assistant' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('denies DISPATCHER without tenantId', async () => {
    const ctx = makeCtx({
      user: { dbId: 99, role: UserRole.MEMBER },
      route: { path: '/desk/agents/:key' },
      params: { key: 'x' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('denies when tenant record is missing (defensive)', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    const ctx = makeCtx({
      user: { dbId: 99, role: UserRole.MEMBER, tenantId: 't-missing' },
      route: { path: '/desk/agents/:key' },
      params: { key: 'x' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 't-missing' },
      select: { id: true },
    });
  });

  // ─── Dispatcher + agents route ──────────────────────────────────

  describe('DISPATCHER on /desk/agents/:key', () => {
    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 10 });
    });

    it('allows when user is the supervisor', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue({ supervisorUserId: 42 });
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/agents/:key' },
        params: { key: 'assistant' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies when user is a different dispatcher', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue({ supervisorUserId: 42 });
      const ctx = makeCtx({
        user: { dbId: 99, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/agents/:key' },
        params: { key: 'assistant' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(false);
    });

    it('denies when agent has no supervisor assigned', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue({ supervisorUserId: null });
      const ctx = makeCtx({
        user: { dbId: 99, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/agents/:key' },
        params: { key: 'assistant' },
      });
      // supervisorUserId null == "unassigned" → denies non-matching
      await expect(guard.canActivate(ctx)).resolves.toBe(false);
    });

    it('passes-through (true) when agent not found so service emits the clean 404', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue(null);
      const ctx = makeCtx({
        user: { dbId: 99, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/agents/:key' },
        params: { key: 'sally-missing' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('scopes agent lookup by tenant (regression — no cross-tenant leak)', async () => {
      prisma.deskAgent.findUnique.mockResolvedValue(null);
      const ctx = makeCtx({
        user: { dbId: 99, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/agents/:key' },
        params: { key: 'exists-in-other-tenant' },
      });
      const result = await guard.canActivate(ctx);
      expect(prisma.deskAgent.findUnique).toHaveBeenCalledWith({
        where: { tenantId_key: { tenantId: 10, key: 'exists-in-other-tenant' } },
        select: { supervisorUserId: true },
      });
      expect(result).toBe(true); // not-found allowed — service raises 404
    });

    it('treats missing :key as not-found and passes through', async () => {
      const ctx = makeCtx({
        user: { dbId: 99, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/agents/:key' },
        params: {},
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(prisma.deskAgent.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── Dispatcher + responsibilities route ─────────────────────────

  describe('DISPATCHER on /desk/responsibilities/:key', () => {
    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 10 });
    });

    it('resolves via the responsibility → agent join scoped by tenant', async () => {
      prisma.deskResponsibility.findUnique.mockResolvedValue({
        agent: { supervisorUserId: 42 },
      });
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/responsibilities/:key' },
        params: { key: 'ar_followup' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(prisma.deskResponsibility.findUnique).toHaveBeenCalledWith({
        where: { tenantId_key: { tenantId: 10, key: 'ar_followup' } },
        select: { agent: { select: { supervisorUserId: true } } },
      });
    });

    it('covers the /run sub-route', async () => {
      prisma.deskResponsibility.findUnique.mockResolvedValue({
        agent: { supervisorUserId: 42 },
      });
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/responsibilities/:key/run' },
        params: { key: 'ar_followup' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('passes through when responsibility not found', async () => {
      prisma.deskResponsibility.findUnique.mockResolvedValue(null);
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/responsibilities/:key' },
        params: { key: 'bogus' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('treats missing :key as not-found and passes through', async () => {
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/responsibilities/:key' },
        params: {},
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(prisma.deskResponsibility.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── Dispatcher + memories route ────────────────────────────────

  describe('DISPATCHER on /desk/memories/:id', () => {
    beforeEach(() => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 10 });
    });

    it('scopes memory lookup with agent.tenantId join', async () => {
      prisma.deskMemory.findFirst.mockResolvedValue({
        agent: { supervisorUserId: 99 },
      });
      const ctx = makeCtx({
        user: { dbId: 99, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/memories/:id' },
        params: { id: 'mem-1' },
      });
      const result = await guard.canActivate(ctx);
      expect(prisma.deskMemory.findFirst).toHaveBeenCalledWith({
        where: { id: 'mem-1', agent: { tenantId: 10 } },
        select: { agent: { select: { supervisorUserId: true } } },
      });
      expect(result).toBe(true);
    });

    it('accepts :memoryId alias for :id', async () => {
      prisma.deskMemory.findFirst.mockResolvedValue({
        agent: { supervisorUserId: 42 },
      });
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/memories/:memoryId' },
        params: { memoryId: 'abc-123' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('passes through when memory not found so service emits clean 404', async () => {
      prisma.deskMemory.findFirst.mockResolvedValue(null);
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/memories/:id' },
        params: { id: 'bogus' },
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('treats missing :id as not-found and passes through', async () => {
      const ctx = makeCtx({
        user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
        route: { path: '/desk/memories/:id' },
        params: {},
      });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(prisma.deskMemory.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── Unknown route ──────────────────────────────────────────────

  it('denies DISPATCHER on an unknown route shape', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 10 });
    const ctx = makeCtx({
      user: { dbId: 1, role: UserRole.MEMBER, tenantId: 't1' },
      route: { path: '/desk/weird/:key' },
      params: { key: 'x' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('falls back to req.url when req.route.path is undefined', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 10 });
    prisma.deskAgent.findUnique.mockResolvedValue({ supervisorUserId: 42 });
    const ctx = makeCtx({
      user: { dbId: 42, role: UserRole.MEMBER, tenantId: 't1' },
      url: '/desk/agents/assistant',
      params: { key: 'assistant' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
