import { Test } from '@nestjs/testing';
import { HitlChallengeService } from '../hitl-challenge.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { createMockOutbox } from '@appshore/platform/test/mocks/outbox.mock';
import { createMockPrisma } from '@appshore/platform/test/mocks/prisma.mock';
import { fromOAuthUser, fromApiKey } from '@appshore/platform/auth/agent-principal';

describe('HitlChallengeService', () => {
  const prisma = createMockPrisma();
  // `events.emit` records what the outbox published after its transaction committed.
  const events = createMockOutbox(prisma);
  let svc: HitlChallengeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        HitlChallengeService,
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxService, useValue: events },
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
    expect(prisma.hitlChallenge.updateMany).not.toHaveBeenCalled();
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
    prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
    });
    expect(r?.id).toBe(1);
    // Spent with a conditional update: only a row still unconsumed is marked.
    expect(prisma.hitlChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, consumedAt: null },
        data: expect.objectContaining({ consumedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.hitlChallenge.update).not.toHaveBeenCalled();
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
    prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });
    const r = await svc.consume('1', {
      tenantId: 7,
      principalId: 'oauth:c',
      toolName: 'void-invoice',
      argsDigest: 'abc',
    });
    expect(r?.id).toBe(1);
  });

  const openRow = () => ({
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
  const consumeInput = { tenantId: 7, principalId: 'oauth:c', toolName: 'void-invoice', argsDigest: 'abc' };

  it('consume refuses, and emits nothing, when another call spent the token between the read and the write', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue(openRow());
    prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.consume('1', consumeInput)).toBeNull();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('two concurrent consumes of one token: exactly one wins (single use)', async () => {
    // Both reads see the open row (the race window); the conditional update lets only the first write through.
    prisma.hitlChallenge.findFirst.mockImplementation(async () => openRow());
    let consumedAt: Date | null = null;
    prisma.hitlChallenge.updateMany.mockImplementation(async ({ where, data }: any) => {
      await new Promise((resolve) => setImmediate(resolve));
      if (where.consumedAt === null && consumedAt === null) {
        consumedAt = data.consumedAt;
        return { count: 1 };
      }
      return { count: 0 };
    });

    const results = await Promise.all([svc.consume('1', consumeInput), svc.consume('1', consumeInput)]);

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('markStepUpCompleted marks an open challenge for the person it names, and says so', async () => {
    prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });
    expect(await svc.markStepUpCompleted('1', 42)).toBe(true);
    expect(prisma.hitlChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        stepUpUserId: 42,
        stepUpCompleted: false,
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
        conversationId: null,
      },
      data: { stepUpCompleted: true },
    });
  });

  it('markStepUpCompleted refuses a used, expired, already-completed or other-person challenge', async () => {
    prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.markStepUpCompleted('1', 42)).toBe(false);
  });

  it('markStepUpCompleted refuses a token that is not an id, without a query', async () => {
    expect(await svc.markStepUpCompleted('not-a-token', 42)).toBe(false);
    expect(prisma.hitlChallenge.updateMany).not.toHaveBeenCalled();
  });

  it('consume never reads a chat grant row: the read is limited to rows with no conversation', async () => {
    prisma.hitlChallenge.findFirst.mockResolvedValue(null);
    await svc.consume('5', { tenantId: 7, principalId: 'user:4', toolName: 't', argsDigest: 'd' });
    expect(prisma.hitlChallenge.findFirst.mock.calls[0][0].where).toMatchObject({ id: 5, conversationId: null });
  });

  describe('chat grants (item 8b)', () => {
    const card = { tenantId: 7, userId: 4, conversationId: 'conv_a', toolCallId: 'call_1' };
    const write = {
      tenantId: 7,
      userId: 4,
      conversationId: 'conv_a',
      toolName: 'create-thing',
      argsDigest: 'd'.repeat(64),
    };

    it('recordChatIntent stores an unconfirmed row bound to the conversation, card, tool and digest', async () => {
      prisma.hitlChallenge.create.mockResolvedValue({ id: 11 });
      await svc.recordChatIntent({
        ...card,
        toolName: write.toolName,
        argsDigest: write.argsDigest,
        scopeRequired: 'platform:write',
      });
      const { data } = prisma.hitlChallenge.create.mock.calls[0][0];
      expect(data).toMatchObject({
        tenantId: 7,
        principalKind: 'user',
        principalId: 'user:4',
        toolName: 'create-thing',
        argsDigest: write.argsDigest,
        scopeRequired: 'platform:write',
        conversationId: 'conv_a',
        toolCallId: 'call_1',
        stepUpRequired: false,
      });
      expect(data).not.toHaveProperty('confirmedAt');
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('confirmChatIntent confirms only an open, unconfirmed card of this person in this conversation, once', async () => {
      prisma.hitlChallenge.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      expect(await svc.confirmChatIntent(card)).toBe(true);
      expect(await svc.confirmChatIntent(card)).toBe(false);
      expect(prisma.hitlChallenge.updateMany.mock.calls[0][0]).toEqual({
        where: {
          tenantId: 7,
          principalId: 'user:4',
          conversationId: 'conv_a',
          toolCallId: 'call_1',
          confirmedAt: null,
          consumedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { confirmedAt: expect.any(Date) },
      });
    });

    it('declineChatIntent voids the card, confirmed or not', async () => {
      prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });
      await svc.declineChatIntent(card);
      expect(prisma.hitlChallenge.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 7, principalId: 'user:4', conversationId: 'conv_a', toolCallId: 'call_1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it('consumeChatGrant spends a confirmed grant for the same conversation, tool and digest with a conditional update', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValue({ id: 11 });
      prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 1 });
      expect(await svc.consumeChatGrant(write)).toBe('11');
      expect(prisma.hitlChallenge.findFirst.mock.calls[0][0].where).toEqual({
        tenantId: 7,
        principalId: 'user:4',
        conversationId: 'conv_a',
        toolName: 'create-thing',
        argsDigest: write.argsDigest,
        confirmedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      });
      expect(prisma.hitlChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: 11, tenantId: 7, consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
    });

    it('consumeChatGrant refuses when there is no confirmed grant, or another call spent it first', async () => {
      prisma.hitlChallenge.findFirst.mockResolvedValueOnce(null);
      expect(await svc.consumeChatGrant(write)).toBeNull();
      expect(prisma.hitlChallenge.updateMany).not.toHaveBeenCalled();

      prisma.hitlChallenge.findFirst.mockResolvedValueOnce({ id: 11 });
      prisma.hitlChallenge.updateMany.mockResolvedValueOnce({ count: 0 });
      expect(await svc.consumeChatGrant(write)).toBeNull();
    });

    it('revokeChatGrants voids confirmed grants only, or every open card with includePending', async () => {
      prisma.hitlChallenge.updateMany.mockResolvedValue({ count: 0 });
      await svc.revokeChatGrants({ tenantId: 7, userId: 4, conversationId: 'conv_a' });
      await svc.revokeChatGrants({ tenantId: 7, userId: 4, conversationId: 'conv_a', includePending: true });
      const base = { tenantId: 7, principalId: 'user:4', conversationId: 'conv_a', consumedAt: null };
      expect(prisma.hitlChallenge.updateMany.mock.calls[0][0].where).toEqual({ ...base, confirmedAt: { not: null } });
      expect(prisma.hitlChallenge.updateMany.mock.calls[1][0].where).toEqual(base);
    });
  });
});
