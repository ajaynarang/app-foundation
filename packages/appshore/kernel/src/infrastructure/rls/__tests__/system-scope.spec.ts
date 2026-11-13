import { Logger } from '@nestjs/common';
import { RlsContextError, currentRls, runAsPublic, runAsTenant } from '../rls-context';
import { forEachTenant, systemScope } from '../system-scope';
import { SYSTEM_REASONS_ALLOWED_IN_TENANT_SCOPE, registerSystemReasons, type SystemReason } from '../system-reasons';

/** A Prisma-style lazy thenable: it records the RLS scope only when awaited. */
function lazyQuery<T>(value: T, seen: unknown[]): PromiseLike<T> {
  return {
    then(onFulfilled, onRejected) {
      seen.push(currentRls());
      return Promise.resolve(value).then(onFulfilled, onRejected);
    },
  };
}

describe('systemScope', () => {
  it('records the system reason for the duration of the callback', async () => {
    const seen = await systemScope('sweep.data-retention', async () => currentRls());
    expect(seen).toEqual({ kind: 'system', reason: 'sweep.data-retention' });
    expect(currentRls()).toBeUndefined();
  });

  it('returns the callback value and propagates its rejection', async () => {
    expect(await systemScope('sweep.job-cleanup', async () => 42)).toBe(42);
    await expect(
      systemScope('sweep.job-cleanup', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('awaits lazy (Prisma-style) results inside the scope', async () => {
    const seen: unknown[] = [];
    const result = await systemScope('sweep.job-cleanup', () => lazyQuery('rows', seen) as Promise<string>);
    expect(result).toBe('rows');
    expect(seen).toEqual([{ kind: 'system', reason: 'sweep.job-cleanup' }]);
  });

  it('rejects a reason that is not listed in strict mode', async () => {
    await expect(systemScope('because' as SystemReason, async () => 'never')).rejects.toThrow(RlsContextError);
  });

  it('rejects inside a tenant scope in strict mode', async () => {
    await runAsTenant(7, 'jwt', async () => {
      await expect(systemScope('sweep.job-cleanup', async () => 'never')).rejects.toThrow(RlsContextError);
    });
  });

  it('allows no foundation reason from inside a tenant scope', () => {
    expect(SYSTEM_REASONS_ALLOWED_IN_TENANT_SCOPE).toEqual([]);
  });

  it('accepts a reason an app registered', async () => {
    registerSystemReasons(['app.nightly-report']);
    expect(await systemScope('app.nightly-report', async () => currentRls())).toEqual({
      kind: 'system',
      reason: 'app.nightly-report',
    });
  });

  it('rejects inside a public scope in strict mode', async () => {
    await runAsPublic('anonymous', async () => {
      await expect(systemScope('sweep.job-cleanup', async () => 'never')).rejects.toThrow(RlsContextError);
    });
  });

  describe('outside strict mode', () => {
    let strict: string | undefined;
    beforeEach(() => {
      strict = process.env.RLS_STRICT_CONTEXT;
      delete process.env.RLS_STRICT_CONTEXT;
    });
    afterEach(() => {
      process.env.RLS_STRICT_CONTEXT = strict;
      jest.restoreAllMocks();
    });

    it('logs an unlisted reason and still runs the callback', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const seen = await systemScope('because' as SystemReason, async () => currentRls());
      expect(seen).toEqual({ kind: 'system', reason: 'because' });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('not a listed system reason'));
    });

    it('logs a conflict with a tenant scope and still runs the callback', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const seen = await runAsTenant(7, 'jwt', () => systemScope('sweep.job-cleanup', async () => currentRls()));
      expect(seen).toEqual({ kind: 'system', reason: 'sweep.job-cleanup' });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('sweep.job-cleanup'));
    });
  });

  it('may nest inside another system scope', async () => {
    const inner = await systemScope('outbox-relay', () => systemScope('sweep.job-cleanup', async () => currentRls()));
    expect(inner).toEqual({ kind: 'system', reason: 'sweep.job-cleanup' });
  });

  it('allows narrowing to a tenant from a system scope', async () => {
    const inner = await systemScope('deadline-sweep', () => runAsTenant(9, 'event', async () => currentRls()));
    expect(inner).toEqual({ kind: 'tenant', tenantId: 9, source: 'event' });
  });
});

describe('forEachTenant', () => {
  it('lists tenants in the system scope, then runs each one as its tenant, in order', async () => {
    const listedIn: unknown[] = [];
    const ranAs: unknown[] = [];
    const rows = await forEachTenant(
      'cron.trial-expiry',
      async () => {
        listedIn.push(currentRls());
        return [{ id: 3 }, { id: 1 }];
      },
      async (tenant) => {
        ranAs.push({ row: tenant.id, ctx: currentRls() });
      },
    );

    expect(rows).toEqual([{ id: 3 }, { id: 1 }]);
    expect(listedIn).toEqual([{ kind: 'system', reason: 'cron.trial-expiry' }]);
    expect(ranAs).toEqual([
      { row: 3, ctx: { kind: 'tenant', tenantId: 3, source: 'cron:cron.trial-expiry' } },
      { row: 1, ctx: { kind: 'tenant', tenantId: 1, source: 'cron:cron.trial-expiry' } },
    ]);
    expect(currentRls()).toBeUndefined();
  });

  it('runs sequentially: the next tenant starts only after the previous one settles', async () => {
    const events: string[] = [];
    await forEachTenant('cron.trial-expiry', [{ id: 1 }, { id: 2 }], async (t) => {
      events.push(`start ${t.id}`);
      await new Promise((resolve) => setImmediate(resolve));
      events.push(`end ${t.id}`);
    });
    expect(events).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('accepts already-listed rows and a tenant accessor for non-tenant rows', async () => {
    const ranAs: Array<number | undefined> = [];
    await forEachTenant(
      'sweep.notification-cleanup',
      [
        { subjectId: 10, tenantId: 4 },
        { subjectId: 11, tenantId: 5 },
      ],
      async () => {
        const ctx = currentRls();
        ranAs.push(ctx?.kind === 'tenant' ? ctx.tenantId : undefined);
      },
      (row) => row.tenantId,
    );
    expect(ranAs).toEqual([4, 5]);
  });

  it('awaits lazy per-tenant work inside the tenant scope', async () => {
    const seen: unknown[] = [];
    await forEachTenant('sweep.data-retention', [{ id: 2 }], () => lazyQuery(undefined, seen) as Promise<void>);
    expect(seen).toEqual([{ kind: 'tenant', tenantId: 2, source: 'cron:sweep.data-retention' }]);
  });

  it('does not swallow errors: a throwing callback stops the loop, as a bare for-loop would', async () => {
    const ran: number[] = [];
    await expect(
      forEachTenant('sweep.tokens-cleanup', [{ id: 1 }, { id: 2 }], async (t) => {
        ran.push(t.id);
        throw new Error(`tenant ${t.id} failed`);
      }),
    ).rejects.toThrow('tenant 1 failed');
    expect(ran).toEqual([1]);
  });

  it('keeps per-tenant isolation when the callback catches, as the converted loops do', async () => {
    const ok: number[] = [];
    await forEachTenant('sweep.login-events-cleanup', [{ id: 1 }, { id: 2 }, { id: 3 }], async (t) => {
      try {
        if (t.id === 2) throw new Error('bad tenant');
        ok.push(t.id);
      } catch {
        // swallowed per tenant
      }
    });
    expect(ok).toEqual([1, 3]);
  });

  it('rejects an unlisted reason before listing in strict mode', async () => {
    const list = jest.fn(async () => [{ id: 1 }]);
    await expect(forEachTenant('nope' as SystemReason, list, async () => undefined)).rejects.toThrow(RlsContextError);
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects a row whose tenant id is not a positive integer in strict mode', async () => {
    await expect(forEachTenant('sweep.whatsapp-stale', [{ id: 0 }], async () => undefined)).rejects.toThrow(
      RlsContextError,
    );
  });

  describe('outside strict mode', () => {
    let strict: string | undefined;
    beforeEach(() => {
      strict = process.env.RLS_STRICT_CONTEXT;
      delete process.env.RLS_STRICT_CONTEXT;
    });
    afterEach(() => {
      process.env.RLS_STRICT_CONTEXT = strict;
      jest.restoreAllMocks();
    });

    it('logs and skips a row with an invalid tenant id, and keeps going', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const ran: number[] = [];
      await forEachTenant(
        'sweep.whatsapp-stale',
        [{ id: 1 }, { id: 0 }, { id: Number.NaN }, { id: 3 }],
        async (row) => {
          ran.push(row.id);
        },
      );
      expect(ran).toEqual([1, 3]);
      expect(error).toHaveBeenCalledTimes(2);
    });

    it('logs an unlisted reason and still visits every row', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const ran: number[] = [];
      await forEachTenant('nope' as SystemReason, [{ id: 1 }, { id: 2 }], async (row) => {
        ran.push(row.id);
      });
      expect(ran).toEqual([1, 2]);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('"nope" is not a listed system reason'));
    });
  });
});
