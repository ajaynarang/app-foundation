import type { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import * as errorTracking from '@appshore/kernel/infrastructure/error-tracking/sentry';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { currentRls, runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { DeadlineHandlerRegistry } from '../deadline-handler.registry';
import {
  DEADLINE_BACKOFF_MAX_MS,
  DEADLINE_HANDLER_TIMEOUT_MS,
  DEADLINE_LEASE_MS,
  DEADLINE_SWEEP_BATCH_SIZE,
  DEADLINE_SWEEP_MAX_BATCHES,
  DeadlineSweeper,
  deadlineBackoffMs,
} from '../deadline.sweeper';
import type { DeadlineHandler, DeadlineOutcome } from '../deadline.types';

function claimed(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dl-1',
    tenantId: 1,
    kind: 'TEST_KIND',
    subjectType: 'order',
    subjectId: 'ord_1',
    dedupeKey: 'k1',
    dueAt: new Date('2026-10-10T10:00:00.000Z'),
    payload: {},
    firedAt: null,
    cancelledAt: null,
    cancelReason: null,
    attempts: 1,
    lockedUntilAt: new Date('2026-10-10T10:02:00.000Z'),
    lastError: null,
    createdAt: new Date('2026-10-09T10:00:00.000Z'),
    updatedAt: new Date('2026-10-10T10:00:00.000Z'),
    ...overrides,
  };
}

function handlerReturning(kind: string, result: DeadlineOutcome | Error): DeadlineHandler & { fire: jest.Mock } {
  return {
    kind,
    fire: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

/** The raw SQL text of the n-th `$queryRaw` call (tagged template: strings array first). */
function sqlOf(prisma: ReturnType<typeof createMockPrisma>, n = 0): string {
  return (prisma.$queryRaw.mock.calls[n][0] as string[]).join('?');
}

describe('DeadlineSweeper', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let registry: DeadlineHandlerRegistry;
  let sweeper: DeadlineSweeper;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.deadline.updateMany.mockResolvedValue({ count: 1 });
    registry = new DeadlineHandlerRegistry();
    sweeper = new DeadlineSweeper(prisma, registry);
  });

  /** `updateMany` calls split by purpose: a lease renewal fences on `attempts`, an outcome stamp does not. */
  function updateCalls(kind: 'renew' | 'stamp') {
    return prisma.deadline.updateMany.mock.calls
      .map((call: unknown[]) => call[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
      .filter((args: { where: Record<string, unknown> }) => 'attempts' in args.where === (kind === 'renew'));
  }

  function stampOf(n = 0) {
    return updateCalls('stamp')[n];
  }

  function renewOf(n = 0) {
    return updateCalls('renew')[n];
  }

  const EMPTY = { claimed: 0, fired: 0, cancelled: 0, rescheduled: 0, failed: 0, skipped: 0, unrecorded: 0 };

  it('owns the deadline-sweep job on bulk-ops', () => {
    expect(sweeper.jobNames).toEqual(['deadline-sweep']);
  });

  it('claims due, unleased pending rows with SKIP LOCKED and a lease, counting the attempt', async () => {
    const before = Date.now();
    await sweeper.sweep();

    const sql = sqlOf(prisma);
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('fired_at IS NULL AND cancelled_at IS NULL');
    expect(sql).toContain('locked_until_at IS NULL OR locked_until_at <=');
    expect(sql).toContain('due_at <=');
    expect(sql).not.toContain('due_at >=');
    expect(sql).toContain('attempts = attempts + 1');
    expect(sql).toContain('ORDER BY due_at');
    const [, leaseUntil, now, dueBy, leaseLapsedBy, limit] = prisma.$queryRaw.mock.calls[0];
    // Parameter order follows the SQL: SET … updated_at, then due_at <= ?, then locked_until_at <= ?.
    expect(sql.indexOf('due_at <=')).toBeLessThan(sql.indexOf('locked_until_at IS NULL'));
    expect(dueBy).toBe(now);
    expect(leaseLapsedBy).toBe(now);
    expect((leaseUntil as Date).getTime() - (now as Date).getTime()).toBe(DEADLINE_LEASE_MS);
    expect((now as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(limit).toBe(DEADLINE_SWEEP_BATCH_SIZE);
  });

  describe('tenant context', () => {
    it('claims in the deadline-sweep system scope', async () => {
      const scopes: unknown[] = [];
      prisma.$queryRaw.mockImplementation(async () => {
        scopes.push(currentRls());
        return [];
      });

      await sweeper.sweep();

      expect(scopes).toEqual([{ kind: 'system', reason: 'deadline-sweep' }]);
    });

    it("runs each handler as its row's tenant, and records the outcome back in the system scope", async () => {
      const seen: unknown[] = [];
      registry.register({
        kind: 'TEST_KIND',
        fire: jest.fn(async () => {
          await new Promise((resolve) => setImmediate(resolve));
          seen.push(currentRls());
          return { outcome: 'fired' as const };
        }),
      });
      const stampScopes: unknown[] = [];
      prisma.deadline.updateMany.mockImplementation(async () => {
        stampScopes.push(currentRls());
        return { count: 1 };
      });
      prisma.$queryRaw.mockResolvedValueOnce([
        claimed({ id: 'dl-1', tenantId: 4 }),
        claimed({ id: 'dl-2', tenantId: 9 }),
      ]);

      await sweeper.sweep();

      expect(seen).toEqual([
        { kind: 'tenant', tenantId: 4, source: 'deadline:TEST_KIND' },
        { kind: 'tenant', tenantId: 9, source: 'deadline:TEST_KIND' },
      ]);
      expect(new Set(stampScopes.map((s) => JSON.stringify(s)))).toEqual(
        new Set([JSON.stringify({ kind: 'system', reason: 'deadline-sweep' })]),
      );
    });

    it('refuses to run inside a tenant request (strict mode)', async () => {
      await expect(runAsTenant(7, 'jwt', () => sweeper.sweep())).rejects.toThrow(/system scope \(deadline-sweep\)/);
    });
  });

  it('stamps firedAt and releases the lease when the handler fires', async () => {
    const handler = handlerReturning('TEST_KIND', { outcome: 'fired' });
    registry.register(handler);
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);

    const summary = await sweeper.sweep();

    expect(handler.fire).toHaveBeenCalledWith(expect.objectContaining({ id: 'dl-1' }));
    expect(stampOf()).toEqual({
      where: { id: 'dl-1', firedAt: null, cancelledAt: null },
      data: { firedAt: expect.any(Date), lockedUntilAt: null },
    });
    expect(summary).toEqual({ ...EMPTY, claimed: 1, fired: 1 });
  });

  it('stamps cancelledAt with the reason when the handler cancels', async () => {
    registry.register(handlerReturning('TEST_KIND', { outcome: 'cancelled', reason: 'approval already given' }));
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);

    const summary = await sweeper.sweep();

    expect(stampOf().data).toEqual({
      cancelledAt: expect.any(Date),
      cancelReason: 'approval already given',
      lockedUntilAt: null,
    });
    expect(summary.cancelled).toBe(1);
  });

  it('cuts a long cancel reason to the column width', async () => {
    registry.register(handlerReturning('TEST_KIND', { outcome: 'cancelled', reason: 'r'.repeat(400) }));
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);

    await sweeper.sweep();

    expect(stampOf().data.cancelReason).toHaveLength(200);
  });

  it('moves dueAt, clears the lease and the last error, and restarts the attempt count on reschedule', async () => {
    const later = new Date('2026-10-11T10:00:00.000Z');
    registry.register(handlerReturning('TEST_KIND', { outcome: 'reschedule', dueAt: later }));
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ attempts: 8, lastError: 'earlier failure' })]);

    const summary = await sweeper.sweep();

    expect(stampOf().data).toEqual({ dueAt: later, lockedUntilAt: null, lastError: null, attempts: 0 });
    expect(summary.rescheduled).toBe(1);
  });

  it('backs off a failure after reschedules from 30 s — the first failed run since the reschedule', async () => {
    registry.register(handlerReturning('TEST_KIND', new Error('transient')));
    // attempts 0 after the reschedule stamp, +1 by the next claim.
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ attempts: 1 })]);
    const before = Date.now();

    await sweeper.sweep();

    const delay = (stampOf().data.lockedUntilAt as Date).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(30_000);
    expect(delay).toBeLessThan(31_000);
  });

  it('treats a reschedule without a valid date as a failure', async () => {
    registry.register(handlerReturning('TEST_KIND', { outcome: 'reschedule', dueAt: new Date('nope') }));
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);

    const summary = await sweeper.sweep();

    expect(stampOf().data.lastError).toBe('handler asked to reschedule without a valid dueAt');
    expect(summary.failed).toBe(1);
  });

  it('treats an unknown outcome as a failure', async () => {
    registry.register(handlerReturning('TEST_KIND', { outcome: 'snooze' } as unknown as DeadlineOutcome));
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);

    const summary = await sweeper.sweep();

    expect(stampOf().data.lastError).toBe('handler returned an unknown outcome');
    expect(summary.failed).toBe(1);
  });

  it('records lastError and backs off when the handler throws — the row stays pending', async () => {
    registry.register(handlerReturning('TEST_KIND', new Error('database hiccup')));
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ attempts: 3 })]);
    const before = Date.now();

    const summary = await sweeper.sweep();

    const { where, data } = stampOf();
    expect(where).toEqual({ id: 'dl-1', firedAt: null, cancelledAt: null });
    expect(data.lastError).toBe('database hiccup');
    expect(data).not.toHaveProperty('firedAt');
    expect(data).not.toHaveProperty('cancelledAt');
    const delay = (data.lockedUntilAt as Date).getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(deadlineBackoffMs(3));
    expect(delay).toBeLessThan(deadlineBackoffMs(3) + 1_000);
    expect(summary.failed).toBe(1);
  });

  it('reports a throwing handler to the tracker with the sweep job name, so the runbook finds it', async () => {
    const reportSpy = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const failure = new Error('database hiccup');
    registry.register(handlerReturning('TEST_KIND', failure));
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ tenantId: 7 })]);

    await sweeper.sweep();

    expect(reportSpy).toHaveBeenCalledWith(failure, {
      jobName: BULK_OPS_JOB_NAMES.DEADLINE_SWEEP,
      tenantId: 7,
      source: errorTracking.ERROR_SOURCE.JOB,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining('TEST_KIND'), err: expect.any(Object) }),
    );
    reportSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('reports a kind with no handler too: it can never fire until the code changes', async () => {
    const reportSpy = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ kind: 'MYSTERY' })]);

    await sweeper.sweep();

    expect(reportSpy).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ jobName: BULK_OPS_JOB_NAMES.DEADLINE_SWEEP, source: errorTracking.ERROR_SOURCE.JOB }),
    );
    reportSpy.mockRestore();
  });

  it('records a non-Error throw as text and cuts lastError to the column width', async () => {
    registry.register({
      kind: 'TEST_KIND',
      fire: jest.fn(async () => {
        throw 'x'.repeat(800);
      }),
    });
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);

    await sweeper.sweep();

    expect(stampOf().data.lastError).toHaveLength(500);
  });

  it('backs off a kind with no handler and says so in lastError', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ kind: 'MYSTERY' })]);

    const summary = await sweeper.sweep();

    expect(stampOf().data.lastError).toBe('no handler for kind MYSTERY');
    expect((stampOf().data.lockedUntilAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(summary.failed).toBe(1);
  });

  it('isolates rows: a throwing handler does not stop the next row from firing', async () => {
    registry.register(handlerReturning('BROKEN', new Error('boom')));
    registry.register(handlerReturning('TEST_KIND', { outcome: 'fired' }));
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ id: 'a', kind: 'BROKEN' }), claimed({ id: 'b' })]);

    const summary = await sweeper.sweep();

    expect(summary).toEqual({ ...EMPTY, claimed: 2, fired: 1, failed: 1 });
    expect(stampOf(1)).toEqual(expect.objectContaining({ where: expect.objectContaining({ id: 'b' }) }));
  });

  it('keeps going when recording one outcome fails — counted unrecorded, the lease brings that row back', async () => {
    registry.register(handlerReturning('TEST_KIND', { outcome: 'fired' }));
    prisma.$queryRaw.mockResolvedValueOnce([claimed({ id: 'a' }), claimed({ id: 'b' })]);
    prisma.deadline.updateMany
      .mockResolvedValueOnce({ count: 1 }) // renew a
      .mockRejectedValueOnce(new Error('connection reset')) // stamp a
      .mockResolvedValueOnce({ count: 1 }) // renew b
      .mockResolvedValueOnce({ count: 1 }); // stamp b

    const summary = await sweeper.sweep();

    expect(updateCalls('stamp')).toHaveLength(2);
    expect(summary).toEqual({ ...EMPTY, claimed: 2, fired: 1, unrecorded: 1 });
  });

  it('drops the outcome when the row was cancelled while its handler ran — counted unrecorded, not fired', async () => {
    registry.register(handlerReturning('TEST_KIND', { outcome: 'fired' }));
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);
    prisma.deadline.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const summary = await sweeper.sweep();

    expect(stampOf().data).toEqual(expect.objectContaining({ firedAt: expect.any(Date) }));
    expect(summary).toEqual({ ...EMPTY, claimed: 1, unrecorded: 1 });
  });

  it('counts a failure whose backoff could not be written as unrecorded', async () => {
    registry.register(handlerReturning('TEST_KIND', new Error('boom')));
    prisma.$queryRaw.mockResolvedValueOnce([claimed()]);
    prisma.deadline.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('connection reset'));

    const summary = await sweeper.sweep();

    expect(summary).toEqual({ ...EMPTY, claimed: 1, unrecorded: 1 });
  });

  describe('lease per row', () => {
    it('renews the lease from now just before the handler runs, fenced on the claim it holds', async () => {
      const handler = handlerReturning('TEST_KIND', { outcome: 'fired' });
      registry.register(handler);
      const row = claimed({ attempts: 2 });
      prisma.$queryRaw.mockResolvedValueOnce([row]);
      const before = Date.now();

      await sweeper.sweep();

      const { where, data } = renewOf();
      expect(where).toEqual({
        id: 'dl-1',
        firedAt: null,
        cancelledAt: null,
        lockedUntilAt: row.lockedUntilAt,
        attempts: 2,
      });
      const lease = (data.lockedUntilAt as Date).getTime() - before;
      expect(lease).toBeGreaterThanOrEqual(DEADLINE_LEASE_MS);
      expect(lease).toBeLessThan(DEADLINE_LEASE_MS + 1_000);
      expect(handler.fire).toHaveBeenCalledWith(expect.objectContaining({ lockedUntilAt: data.lockedUntilAt }));
      const renewOrder = prisma.deadline.updateMany.mock.invocationCallOrder[0];
      expect(renewOrder).toBeLessThan(handler.fire.mock.invocationCallOrder[0]);
    });

    it('gives each row of a batch its own lease, renewed after the rows ahead of it ran', async () => {
      let clock = Date.parse('2026-10-10T10:00:00.000Z');
      const spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
      const handler: DeadlineHandler & { fire: jest.Mock } = {
        kind: 'TEST_KIND',
        fire: jest.fn(async () => {
          clock += 50_000; // each handler takes 50 s — three rows outlive one 2-minute lease
          return { outcome: 'fired' } as DeadlineOutcome;
        }),
      };
      registry.register(handler);
      prisma.$queryRaw.mockResolvedValueOnce([claimed({ id: 'a' }), claimed({ id: 'b' }), claimed({ id: 'c' })]);

      try {
        await sweeper.sweep();
      } finally {
        spy.mockRestore();
      }

      const leases = updateCalls('renew').map((call) => (call.data.lockedUntilAt as Date).getTime());
      const start = Date.parse('2026-10-10T10:00:00.000Z');
      expect(leases).toEqual([0, 50_000, 100_000].map((offset) => start + offset + DEADLINE_LEASE_MS));
    });

    it('skips a row whose lease another sweeper took (or that was resolved) — its handler never runs', async () => {
      const handler = handlerReturning('TEST_KIND', { outcome: 'fired' });
      registry.register(handler);
      prisma.$queryRaw.mockResolvedValueOnce([claimed()]);
      prisma.deadline.updateMany.mockResolvedValueOnce({ count: 0 });

      const summary = await sweeper.sweep();

      expect(handler.fire).not.toHaveBeenCalled();
      expect(updateCalls('stamp')).toHaveLength(0);
      expect(summary).toEqual({ ...EMPTY, claimed: 1, skipped: 1 });
    });

    it('skips a row whose lease could not be renewed — it comes back once the claim lapses', async () => {
      const handler = handlerReturning('TEST_KIND', { outcome: 'fired' });
      registry.register(handler);
      prisma.$queryRaw.mockResolvedValueOnce([claimed()]);
      prisma.deadline.updateMany.mockRejectedValueOnce(new Error('connection reset'));

      const summary = await sweeper.sweep();

      expect(handler.fire).not.toHaveBeenCalled();
      expect(summary).toEqual({ ...EMPTY, claimed: 1, skipped: 1 });
    });
  });

  describe('handler timeout', () => {
    afterEach(() => jest.useRealTimers());

    it('keeps the timeout well inside the lease', () => {
      expect(DEADLINE_HANDLER_TIMEOUT_MS).toBeLessThanOrEqual(DEADLINE_LEASE_MS / 2);
    });

    it('fails a handler that never answers, backs it off, and moves on to the next row', async () => {
      jest.useFakeTimers({ doNotFake: ['Date'] });
      registry.register({ kind: 'HANGS', fire: jest.fn(() => new Promise<DeadlineOutcome>(() => undefined)) });
      registry.register(handlerReturning('TEST_KIND', { outcome: 'fired' }));
      prisma.$queryRaw.mockResolvedValueOnce([claimed({ id: 'a', kind: 'HANGS' }), claimed({ id: 'b' })]);

      const sweep = sweeper.sweep();
      await jest.advanceTimersByTimeAsync(DEADLINE_HANDLER_TIMEOUT_MS);
      const summary = await sweep;

      expect(stampOf(0)).toEqual({
        where: { id: 'a', firedAt: null, cancelledAt: null },
        data: { lastError: 'handler timed out after 60 s', lockedUntilAt: expect.any(Date) },
      });
      expect(summary).toEqual({ ...EMPTY, claimed: 2, fired: 1, failed: 1 });
    });

    it('clears its timer once the handler answers', async () => {
      jest.useFakeTimers({ doNotFake: ['Date'] });
      registry.register(handlerReturning('TEST_KIND', { outcome: 'fired' }));
      prisma.$queryRaw.mockResolvedValueOnce([claimed()]);

      await sweeper.sweep();

      expect(jest.getTimerCount()).toBe(0);
    });
  });

  it('claims another batch while batches come back full, and stops at the per-tick cap', async () => {
    registry.register(handlerReturning('TEST_KIND', { outcome: 'fired' }));
    const fullBatch = Array.from({ length: DEADLINE_SWEEP_BATCH_SIZE }, (_, i) => claimed({ id: `r${i}` }));
    prisma.$queryRaw.mockResolvedValue(fullBatch);

    const summary = await sweeper.sweep();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(DEADLINE_SWEEP_MAX_BATCHES);
    expect(summary.claimed).toBe(DEADLINE_SWEEP_BATCH_SIZE * DEADLINE_SWEEP_MAX_BATCHES);
  });

  it('stops after a short batch', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await sweeper.sweep();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('runs the sweep for its job inside the job log context', async () => {
    const summary = await sweeper.run({ id: 'j1', name: 'deadline-sweep', data: {} } as Job);

    expect(summary.claimed).toBe(0);
  });
});

describe('deadlineBackoffMs', () => {
  it('doubles from 30 seconds per attempt', () => {
    expect(deadlineBackoffMs(1)).toBe(30_000);
    expect(deadlineBackoffMs(2)).toBe(60_000);
    expect(deadlineBackoffMs(4)).toBe(240_000);
  });

  it('caps at one hour, however many attempts', () => {
    expect(deadlineBackoffMs(8)).toBe(DEADLINE_BACKOFF_MAX_MS);
    expect(deadlineBackoffMs(10_000)).toBe(DEADLINE_BACKOFF_MAX_MS);
  });

  it('treats a zero attempt count as the first', () => {
    expect(deadlineBackoffMs(0)).toBe(30_000);
  });
});

describe('DeadlineHandlerRegistry', () => {
  it('registers one handler per kind and lists the kinds', () => {
    const registry = new DeadlineHandlerRegistry();
    const b = handlerReturning('B', { outcome: 'fired' });
    registry.register(b);
    registry.register(handlerReturning('A', { outcome: 'fired' }));

    expect(registry.get('B')).toBe(b);
    expect(registry.get('C')).toBeUndefined();
    expect(registry.kinds()).toEqual(['A', 'B']);
  });

  it('refuses a second handler for the same kind', () => {
    const registry = new DeadlineHandlerRegistry();
    registry.register(handlerReturning('A', { outcome: 'fired' }));

    expect(() => registry.register(handlerReturning('A', { outcome: 'fired' }))).toThrow(/already registered/);
  });
});
