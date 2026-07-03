import { Test } from '@nestjs/testing';
import { HitlChallengeService } from '../hitl-challenge.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { fromOAuthUser, fromApiKey } from '@appshore/platform/auth/agent-principal';

describe('HitlChallengeService', () => {
  const prisma = createMockPrisma();
  const events = { emit: jest.fn() };
  let svc: HitlChallengeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        HitlChallengeService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: events },
      ],
    }).compile();
    svc = mod.get(HitlChallengeService);
  });

  const baseInput = {
    principal: fromOAuthUser({
      onBehalfOfUserDbId: Number('1'),
      tenantDbId: 7,
      role: 'ADMIN',
      scopes: ['platform:write:sensitive'],
      clientId: 'c',
    }),
    toolName: 'void-invoice',
    scopeRequired: 'platform:write:sensitive',
    tier: 'sensitive' as const,
    argsDigest: 'abc',
  };

  it('issue returns token + ttl=300 + stepUpRequired=true for sensitive tier (oauth)', async () => {
    prisma.hitlChallenge.create.mockResolvedValue({ id: 1 });
    const out = await svc.issue(baseInput);
    expect(out.token).toBe('1');
    expect(out.ttlSeconds).toBe(300);
    expect(out.stepUpRequired).toBe(true);

    const args = prisma.hitlChallenge.create.mock.calls[0][0];
    expect(args.data).toEqual(
      expect.objectContaining({
        tenantId: 7,
        principalKind: 'oauth_client',
        principalId: 'oauth:c',
        toolName: 'void-invoice',
        argsDigest: 'abc',
        scopeRequired: 'platform:write:sensitive',
        tier: 'sensitive',
        stepUpRequired: true,
        stepUpUserId: 1,
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.stringMatching(/hitl-challenge-issued/),
      '7',
      expect.objectContaining({
        token: '1',
        tier: 'sensitive',
        stepUpRequired: true,
      }),
    );
  });

  it('issue returns ttl=600 + stepUpRequired=false for standard tier', async () => {
    prisma.hitlChallenge.create.mockResolvedValue({ id: 2 });
    const out = await svc.issue({
      ...baseInput,
      tier: 'standard',
      scopeRequired: 'platform:write',
      principal: fromOAuthUser({
        onBehalfOfUserDbId: Number('1'),
        tenantDbId: 7,
        role: 'ADMIN',
        scopes: ['platform:write'],
        clientId: 'c',
      }),
    });
    expect(out.ttlSeconds).toBe(600);
    expect(out.stepUpRequired).toBe(false);
    const args = prisma.hitlChallenge.create.mock.calls[0][0];
    expect(args.data.stepUpRequired).toBe(false);
  });

  it('issue sets stepUpUserId from api_key principal user', async () => {
    prisma.hitlChallenge.create.mockResolvedValue({ id: 3 });
    const principal = fromApiKey({
      apiKeyId: 1,
      tenantId: 7,
      userId: 42,
      scopes: ['platform:write:sensitive'],
    });
    await svc.issue({ ...baseInput, principal });
    const args = prisma.hitlChallenge.create.mock.calls[0][0];
    expect(args.data.principalKind).toBe('api_key');
    expect(args.data.principalId).toBe('apikey:1');
    expect(args.data.stepUpUserId).toBe(42);
  });

  it('consume returns null when the token is unknown or expired', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue(null);
    const r = await svc.consume('unknown', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
    });
    expect(r).toBeNull();
    expect(prisma.hitlChallenge.update).not.toHaveBeenCalled();
  });

  it('consume rejects when principal mismatch', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
      tier: 'sensitive',
      stepUpRequired: true,
      stepUpCompleted: true,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:d',
      toolName: 'void-invoice',
      argsDigest: 'abc',
    });
    expect(r).toBeNull();
  });

  it('consume rejects when toolName mismatch', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
      tier: 'standard',
      stepUpRequired: false,
      stepUpCompleted: false,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'other-tool',
      argsDigest: 'abc',
    });
    expect(r).toBeNull();
  });

  it('consume rejects when argsDigest mismatch', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
      tier: 'standard',
      stepUpRequired: false,
      stepUpCompleted: false,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'different',
    });
    expect(r).toBeNull();
  });

  it('consume rejects sensitive tokens whose step-up has not completed', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
      tier: 'sensitive',
      stepUpRequired: true,
      stepUpCompleted: false,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
    });
    expect(r).toBeNull();
  });

  it('consume succeeds + marks consumed + emits completed event on standard-tier match', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
      tier: 'standard',
      stepUpRequired: false,
      stepUpCompleted: false,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.hitlChallenge.update.mockResolvedValue({});
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
    });
    expect(r?.id).toBe(1);
    expect(prisma.hitlChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      expect.stringMatching(/hitl-challenge-completed/),
      '7',
      expect.objectContaining({ token: '1', toolName: 'void-invoice' }),
    );
  });

  it('consume succeeds on sensitive-tier match when step-up was completed', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
      tier: 'sensitive',
      stepUpRequired: true,
      stepUpCompleted: true,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.hitlChallenge.update.mockResolvedValue({});
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
    });
    expect(r?.id).toBe(1);
  });

  it('markStepUpCompleted sets stepUpCompleted=true for the right user+token combo', async () => {
    prisma.hitlChallenge.update.mockResolvedValue({ id: 1 });
    await svc.markStepUpCompleted('1', 42);
    expect(prisma.hitlChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, stepUpUserId: 42, stepUpCompleted: false },
        data: { stepUpCompleted: true },
      }),
    );
  });
});
