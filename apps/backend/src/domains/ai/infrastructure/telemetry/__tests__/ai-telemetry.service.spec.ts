import { Test } from '@nestjs/testing';
import { Prisma } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { createMockOutbox } from '@appshore/platform/test/mocks/outbox.mock';
import { DOMAIN_EVENTS } from '../../../../../platform-glue/events/domain-events.constants';
import { AiTelemetryService } from '../ai-telemetry.service';
import type { AiCallContext, AiUsage } from '@app/shared-types';

const TENANT_ID = 42;

/**
 * Build a minimal valid usage object. Each test overrides what it needs.
 */
function makeUsage(overrides: Partial<AiUsage> = {}): AiUsage {
  return {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    status: 'OK',
    latencyMs: 1234,
    ...overrides,
  };
}

function makeContext(overrides: Partial<AiCallContext> = {}): AiCallContext {
  return {
    tenantId: TENANT_ID,
    surface: 'KB_INGEST',
    ...overrides,
  };
}

/**
 * Pricing snapshot used across most tests. Anthropic Sonnet 4.6 reference
 * rates per the PR 1 seed; if those change, the math in the cost-test
 * expectations updates with them — that's intentional.
 */
const SONNET_PRICING = {
  id: 1,
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  inputPerMtokUsd: new Prisma.Decimal('3.000000'),
  outputPerMtokUsd: new Prisma.Decimal('15.000000'),
  cachedInputPerMtokUsd: new Prisma.Decimal('0.300000'),
  effectiveFromDate: new Date('2026-05-27T00:00:00.000Z'),
  effectiveUntilDate: null,
  notes: null,
  createdAt: new Date(),
};

describe('AiTelemetryService', () => {
  let service: AiTelemetryService;
  let prisma: any;
  let cache: any;
  let events: any;
  let outbox: ReturnType<typeof createMockOutbox>;

  beforeEach(async () => {
    prisma = {
      modelPricing: {
        findFirst: jest.fn().mockResolvedValue(SONNET_PRICING),
      },
      aiInvocation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          ...data,
          createdAt: new Date(),
        })),
      },
      tenantAiBudget: {
        upsert: jest.fn().mockResolvedValue({
          tenantId: TENANT_ID,
          dailySoftUsd: new Prisma.Decimal('5'),
          dailyHardUsd: new Prisma.Decimal('20'),
          monthlySoftUsd: new Prisma.Decimal('50'),
          monthlyHardUsd: new Prisma.Decimal('200'),
        }),
      },
      tenant: {
        // Default: tenant does NOT require zero-retention.
        findUnique: jest.fn().mockResolvedValue({ aiZeroRetention: false }),
      },
      // Default: zero spend.
      $queryRaw: jest.fn().mockResolvedValue([{ daily: '0', monthly: '0' }]),
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    // Default cache: pass-through to the factory (no caching effect for tests
    // unless explicitly overridden — the cache mechanics are tested by the
    // cache module, not by us).
    cache = {
      getOrSet: jest.fn().mockImplementation(async (_key: string, factory: any) => factory()),
      del: jest.fn().mockResolvedValue(undefined),
    };

    events = {
      emit: jest.fn().mockResolvedValue(undefined),
    };
    outbox = createMockOutbox(prisma);

    const module = await Test.createTestingModule({
      providers: [
        AiTelemetryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppCacheService, useValue: cache },
        { provide: DomainEventService, useValue: events },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(AiTelemetryService);
  });

  describe('record() — context guards', () => {
    it('throws when tenantId is missing', async () => {
      await expect(service.record(makeUsage(), { ...makeContext(), tenantId: undefined as any })).rejects.toThrow(
        /tenantId is required/,
      );
    });

    it('throws when surface is missing', async () => {
      await expect(service.record(makeUsage(), { ...makeContext(), surface: undefined as any })).rejects.toThrow(
        /surface is required/,
      );
    });

    it('does NOT throw when only optional fields are missing', async () => {
      await expect(service.record(makeUsage(), makeContext())).resolves.toBeDefined();
    });
  });

  describe('record() — cost computation', () => {
    it('persists computed cost for a standard input + output call', async () => {
      // 1000 prompt - 0 cached = 1000 billable input @ $3/Mtok = $0.003
      // 500 completion @ $15/Mtok = $0.0075
      // Total: $0.0105
      await service.record(makeUsage({ promptTokens: 1000, completionTokens: 500 }), makeContext());

      expect(prisma.aiInvocation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            costUsd: expect.any(Prisma.Decimal),
          }),
        }),
      );
      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect((call.data.costUsd as Prisma.Decimal).toString()).toBe('0.0105');
    });

    it('subtracts cached tokens from billable input and adds cached cost', async () => {
      // 1000 prompt with 800 cached:
      //   200 billable input @ $3 = $0.0006
      //   800 cached @ $0.30 = $0.00024
      //   500 completion @ $15 = $0.0075
      //   Total: $0.00834
      await service.record(makeUsage({ promptTokens: 1000, completionTokens: 500, cachedTokens: 800 }), makeContext());

      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect((call.data.costUsd as Prisma.Decimal).toString()).toBe('0.00834');
    });

    it('treats cachedTokens correctly when pricing has no cached rate', async () => {
      // Embeddings have no cached rate. Cached tokens just get subtracted
      // from billable input, no cached-cost addend.
      prisma.modelPricing.findFirst.mockResolvedValue({
        ...SONNET_PRICING,
        cachedInputPerMtokUsd: null,
      });

      await service.record(makeUsage({ promptTokens: 1000, completionTokens: 0, cachedTokens: 200 }), makeContext());

      // 800 billable * $3 / 1M = $0.0024, no cached cost, no output cost
      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect((call.data.costUsd as Prisma.Decimal).toString()).toBe('0.0024');
    });

    it('clamps negative billable input to zero (defensive)', async () => {
      // Cached tokens exceed prompt tokens — shouldn't happen but the math
      // should not produce a negative cost row.
      await service.record(makeUsage({ promptTokens: 500, completionTokens: 0, cachedTokens: 1000 }), makeContext());

      const call = prisma.aiInvocation.create.mock.calls[0][0];
      const cost = (call.data.costUsd as Prisma.Decimal).toString();
      // 0 billable input * $3 + 1000 cached * $0.30 = $0.0003
      expect(cost).toBe('0.0003');
    });
  });

  describe('record() — missing pricing', () => {
    it('persists the row with null costUsd when no pricing matches', async () => {
      prisma.modelPricing.findFirst.mockResolvedValue(null);

      const logSpy = jest.spyOn((service as any).logger, 'warn');

      await service.record(makeUsage({ model: 'never-seeded' }), makeContext());

      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect(call.data.costUsd).toBeNull();
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/no model_pricing row/i));
    });
  });

  describe('record() — long-prompt price tier', () => {
    it('warns when a Haiku 5.5 prompt is above 100K tokens, because its one pricing row understates the cost', async () => {
      const logSpy = jest.spyOn((service as any).logger, 'warn');

      await service.record(makeUsage({ model: 'claude-haiku-5-5', promptTokens: 100_001 }), makeContext());

      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/understated/));
      expect(prisma.aiInvocation.create).toHaveBeenCalled();
    });

    it('stays quiet at or below the threshold, and for a model with one rate', async () => {
      const logSpy = jest.spyOn((service as any).logger, 'warn');

      await service.record(makeUsage({ model: 'claude-haiku-5-5', promptTokens: 100_000 }), makeContext());
      await service.record(makeUsage({ model: 'claude-sonnet-5-5', promptTokens: 500_000 }), makeContext());

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringMatching(/understated/));
    });
  });

  describe('record() — idempotency', () => {
    it('returns the existing row and skips create when idempotencyKey matches', async () => {
      const existing = {
        id: 'existing-id',
        tenantId: TENANT_ID,
        idempotencyKey: 'k1',
      };
      prisma.aiInvocation.findUnique.mockResolvedValue(existing);

      const result = await service.record(makeUsage(), makeContext({ idempotencyKey: 'k1' }));

      expect(result).toBe(existing);
      expect(prisma.aiInvocation.create).not.toHaveBeenCalled();
    });

    it('creates a new row when idempotencyKey is set but no match exists', async () => {
      prisma.aiInvocation.findUnique.mockResolvedValue(null);

      await service.record(makeUsage(), makeContext({ idempotencyKey: 'k-new' }));

      expect(prisma.aiInvocation.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'k-new' },
      });
      expect(prisma.aiInvocation.create).toHaveBeenCalledTimes(1);
    });

    it('skips the idempotency lookup entirely when no key is provided', async () => {
      await service.record(makeUsage(), makeContext());

      expect(prisma.aiInvocation.findUnique).not.toHaveBeenCalled();
      expect(prisma.aiInvocation.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('record() — domain event', () => {
    /** The events `record()` staged on its transaction: `stage(tx, name, tenantId, payload)` minus the tx. */
    const stagedEvents = () => outbox.stage.mock.calls.map(([, ...args]) => args);

    it("stages AI_INVOCATION_RECORDED on the row's transaction and publishes it after commit (outbox)", async () => {
      const row = await service.record(makeUsage(), makeContext());

      expect(outbox.stage).toHaveBeenCalledWith(
        prisma, // the mock $transaction hands the client in as the tx
        DOMAIN_EVENTS.AI_INVOCATION_RECORDED,
        TENANT_ID,
        expect.objectContaining({
          invocationId: (row as any).id,
          surface: 'KB_INGEST',
          model: 'claude-sonnet-4-6',
          provider: 'anthropic',
          totalTokens: 1500,
        }),
      );
      const stagedEvent = await outbox.stage.mock.results[0].value;
      expect(outbox.publishStaged).toHaveBeenCalledWith([stagedEvent]);
    });

    it('does not wait for the publish: a hung enqueue never holds up the AI call', async () => {
      outbox.publishStaged.mockReturnValue(new Promise<void>(() => undefined));

      const row = await service.record(makeUsage(), makeContext());

      expect(row).toBeDefined();
      expect(outbox.publishStaged).toHaveBeenCalledTimes(1);
      // The spent cache is dropped on commit, not after the publish.
      expect(cache.del).toHaveBeenCalledTimes(1);
    });

    it('publishes nothing when the ledger write fails', async () => {
      prisma.aiInvocation.create.mockRejectedValue(new Error('db down'));

      await expect(service.record(makeUsage(), makeContext())).rejects.toThrow('db down');
      expect(outbox.stage).not.toHaveBeenCalled();
      expect(outbox.publishStaged).not.toHaveBeenCalled();
    });

    it('publishes nothing when the transaction rolls back after staging', async () => {
      prisma.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
        await fn(prisma);
        throw new Error('commit failed');
      });

      await expect(service.record(makeUsage(), makeContext())).rejects.toThrow('commit failed');
      expect(outbox.publishStaged).not.toHaveBeenCalled();
    });

    it('stages nothing for an idempotent replay — no row written, no second event for one invocation', async () => {
      const existing = { id: 'existing-id', tenantId: TENANT_ID, totalTokens: 1 };
      prisma.aiInvocation.findUnique.mockResolvedValue(existing);

      const result = await service.record(makeUsage(), makeContext({ idempotencyKey: 'k1' }));

      expect(result).toBe(existing);
      expect(prisma.aiInvocation.create).not.toHaveBeenCalled();
      expect(outbox.stage).not.toHaveBeenCalled();
      expect(outbox.publishStaged).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('stages the event once when the key is new', async () => {
      await service.record(makeUsage(), makeContext({ idempotencyKey: 'k-new' }));

      expect(stagedEvents()).toEqual([
        [
          DOMAIN_EVENTS.AI_INVOCATION_RECORDED,
          TENANT_ID,
          expect.objectContaining({ surface: 'KB_INGEST', totalTokens: 1500 }),
        ],
      ]);
    });
  });

  describe('record() — row shape', () => {
    it('writes every context + usage field through to the row', async () => {
      const context: AiCallContext = {
        tenantId: TENANT_ID,
        userId: 7,
        surface: 'CHAT',
        agentId: 'assistant-loads',
        linkRefType: 'conversation_message',
        linkRefId: 'msg-123',
        parentInvocationId: '01900000-0000-7000-8000-000000000000',
        idempotencyKey: 'kk',
        langfuseTraceId: 'lf-trace-1',
      };
      const usage: AiUsage = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 20,
        latencyMs: 200,
        status: 'OK',
      };

      await service.record(usage, context);

      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect(call.data).toMatchObject({
        tenantId: TENANT_ID,
        userId: 7,
        surface: 'CHAT',
        agentId: 'assistant-loads',
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 20,
        latencyMs: 200,
        status: 'OK',
        parentInvocationId: '01900000-0000-7000-8000-000000000000',
        linkRefType: 'conversation_message',
        linkRefId: 'msg-123',
        langfuseTraceId: 'lf-trace-1',
        idempotencyKey: 'kk',
      });
      // UUIDv7 id is generated by the service, not supplied
      expect(call.data.id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('persists status=ERROR with errorCode', async () => {
      await service.record(
        makeUsage({ status: 'ERROR', errorCode: 'AnthropicRateLimit', latencyMs: 50 }),
        makeContext(),
      );

      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect(call.data.status).toBe('ERROR');
      expect(call.data.errorCode).toBe('AnthropicRateLimit');
    });

    it('records the route that served the call and the credential type behind it', async () => {
      await service.record(
        makeUsage({ routeId: 'platform-openrouter', credentialType: 'PLATFORM_OPENROUTER' }),
        makeContext(),
      );

      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect(call.data.routeId).toBe('platform-openrouter');
      expect(call.data.credentialType).toBe('PLATFORM_OPENROUTER');
    });

    it('coerces null-ish optional fields to explicit null', async () => {
      await service.record(makeUsage(), makeContext());
      const call = prisma.aiInvocation.create.mock.calls[0][0];
      expect(call.data.userId).toBeNull();
      expect(call.data.agentId).toBeNull();
      expect(call.data.linkRefType).toBeNull();
      expect(call.data.linkRefId).toBeNull();
      expect(call.data.langfuseTraceId).toBeNull();
      expect(call.data.idempotencyKey).toBeNull();
      expect(call.data.routeId).toBeNull();
      expect(call.data.credentialType).toBeNull();
    });
  });

  describe('resolvePricing() — caching', () => {
    it('caches the pricing lookup under the expected key', async () => {
      await service.record(makeUsage(), makeContext());

      expect(cache.getOrSet).toHaveBeenCalledWith(
        'app:ai-telemetry:pricing:anthropic:claude-sonnet-4-6',
        expect.any(Function),
        expect.any(Number),
      );
    });

    it('queries with effectiveFromDate <= now and effectiveUntilDate null OR > now', async () => {
      // Wire the factory through to verify the where clause
      cache.getOrSet.mockImplementation(async (_key: string, factory: any) => factory());

      await service.record(makeUsage(), makeContext());

      expect(prisma.modelPricing.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            effectiveFromDate: { lte: expect.any(Date) },
            OR: [{ effectiveUntilDate: null }, { effectiveUntilDate: { gt: expect.any(Date) } }],
          }),
          orderBy: { effectiveFromDate: 'desc' },
        }),
      );
    });
  });

  describe('checkBudget() — state transitions', () => {
    function setSpent(daily: string, monthly: string) {
      prisma.$queryRaw.mockResolvedValue([{ daily, monthly }]);
    }

    it('returns ok when spend is below the soft caps', async () => {
      setSpent('1.00', '10.00');
      const state = await service.checkBudget(TENANT_ID);
      expect(state.state).toBe('ok');
      expect(state.dailyUsdSpent).toBe('1.000000');
    });

    it('returns soft when daily spend crosses the daily soft cap', async () => {
      setSpent('5.00', '10.00'); // daily soft = 5
      const state = await service.checkBudget(TENANT_ID);
      expect(state.state).toBe('soft');
    });

    it('returns soft when monthly spend crosses the monthly soft cap (daily fine)', async () => {
      setSpent('1.00', '50.00'); // monthly soft = 50
      const state = await service.checkBudget(TENANT_ID);
      expect(state.state).toBe('soft');
    });

    it('returns hard when daily spend hits the daily hard cap', async () => {
      setSpent('20.00', '30.00'); // daily hard = 20
      const state = await service.checkBudget(TENANT_ID);
      expect(state.state).toBe('hard');
    });

    it('returns hard when monthly spend hits the monthly hard cap even if daily is fine', async () => {
      setSpent('1.00', '200.00'); // monthly hard = 200
      const state = await service.checkBudget(TENANT_ID);
      expect(state.state).toBe('hard');
    });
  });

  describe('assertBudget() — enforcement', () => {
    function setSpent(daily: string, monthly: string) {
      prisma.$queryRaw.mockResolvedValue([{ daily, monthly }]);
    }

    it('does not throw and returns state on ok', async () => {
      setSpent('1.00', '1.00');
      const state = await service.assertBudget(TENANT_ID);
      expect(state.state).toBe('ok');
    });

    it('emits soft-breach event and returns without throwing on soft', async () => {
      setSpent('6.00', '10.00');
      const state = await service.assertBudget(TENANT_ID);
      expect(state.state).toBe('soft');
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.AI_BUDGET_SOFT_BREACHED,
        TENANT_ID,
        expect.objectContaining({ state: 'soft' }),
      );
    });

    it('throws AiBudgetExceededError and emits hard-breach event on hard', async () => {
      setSpent('25.00', '30.00');
      await expect(service.assertBudget(TENANT_ID)).rejects.toMatchObject({
        tenantId: TENANT_ID,
      });
      expect(events.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.AI_BUDGET_HARD_BREACHED,
        TENANT_ID,
        expect.objectContaining({ state: 'hard' }),
      );
    });

    it('fails open (returns ok, does not throw) when budget evaluation errors', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('db down'));
      const state = await service.assertBudget(TENANT_ID);
      expect(state.state).toBe('ok');
    });
  });

  describe('budget — lazy budget row creation', () => {
    it('upserts a default budget row (getOrCreate)', async () => {
      await service.checkBudget(TENANT_ID);
      expect(prisma.tenantAiBudget.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID }, create: { tenantId: TENANT_ID }, update: {} }),
      );
    });
  });

  describe('record() — spent cache invalidation', () => {
    it('busts the per-tenant spent cache after a successful record', async () => {
      await service.record(makeUsage(), makeContext());
      expect(cache.del).toHaveBeenCalledWith('app:ai-telemetry:spent:42');
    });
  });
});
