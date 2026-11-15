import {
  RlsContextError,
  currentRls,
  isRlsStrict,
  isRlsTenantId,
  rlsStorage,
  runAsPublic,
  runAsTenant,
  runInEventScope,
  runInJobScope,
  setRlsTenant,
  toRlsTenantId,
} from '../rls-context';
import { Logger } from '@nestjs/common';
import { RlsContextMiddleware } from '../rls-context.middleware';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('rls-context', () => {
  describe('currentRls', () => {
    it('is undefined outside any scope', () => {
      expect(currentRls()).toBeUndefined();
    });
  });

  describe('setRlsTenant', () => {
    it('returns false and sets nothing when no holder is open', () => {
      expect(setRlsTenant(7, 'jwt')).toBe(false);
      expect(currentRls()).toBeUndefined();
    });

    it('pins the open holder to the tenant', () => {
      rlsStorage.run({}, () => {
        expect(setRlsTenant(7, 'jwt')).toBe(true);
        expect(currentRls()).toEqual({ kind: 'tenant', tenantId: 7, source: 'jwt' });
      });
    });

    it('is a no-op when the same tenant is set again', () => {
      rlsStorage.run({}, () => {
        setRlsTenant(7, 'jwt');
        expect(setRlsTenant(7, 'api-key')).toBe(true);
        expect(currentRls()).toEqual({ kind: 'tenant', tenantId: 7, source: 'jwt' });
      });
    });

    describe('outside strict mode (deployed default while nothing enforces it)', () => {
      let strict: string | undefined;
      let error: jest.SpyInstance;

      beforeEach(() => {
        strict = process.env.RLS_STRICT_CONTEXT;
        delete process.env.RLS_STRICT_CONTEXT;
        error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      });

      afterEach(() => {
        process.env.RLS_STRICT_CONTEXT = strict;
        error.mockRestore();
      });

      it('keeps the first tenant and logs both ids and the source on a conflict', () => {
        rlsStorage.run({}, () => {
          setRlsTenant(7, 'jwt');
          expect(setRlsTenant(8, 'oauth')).toBe(false);
          expect(currentRls()).toEqual({ kind: 'tenant', tenantId: 7, source: 'jwt' });
        });
        expect(error).toHaveBeenCalledWith(expect.stringMatching(/tenant 8 \(oauth\).*tenant 7 \(jwt\)/));
      });

      it('keeps a public scope and logs instead of throwing', () => {
        rlsStorage.run({ ctx: { kind: 'public', source: 'anonymous' } }, () => {
          expect(setRlsTenant(7, 'jwt')).toBe(false);
          expect(currentRls()).toEqual({ kind: 'public', source: 'anonymous' });
        });
        expect(error).toHaveBeenCalledTimes(1);
      });

      it('still rejects an invalid tenant id', () => {
        rlsStorage.run({}, () => {
          expect(() => setRlsTenant(0, 'jwt')).toThrow(RlsContextError);
        });
      });
    });

    it('throws when a different tenant is already set (strict mode)', () => {
      rlsStorage.run({}, () => {
        setRlsTenant(7, 'jwt');
        expect(() => setRlsTenant(8, 'oauth')).toThrow(RlsContextError);
        expect(currentRls()).toEqual({ kind: 'tenant', tenantId: 7, source: 'jwt' });
      });
    });

    it('throws when the scope is public (strict mode)', () => {
      rlsStorage.run({ ctx: { kind: 'public', source: 'anonymous' } }, () => {
        expect(() => setRlsTenant(7, 'jwt')).toThrow(RlsContextError);
      });
    });

    it.each([0, -1, 1.5, Number.NaN, '7' as unknown as number])('rejects the invalid tenant id %p', (id) => {
      rlsStorage.run({}, () => {
        expect(() => setRlsTenant(id, 'jwt')).toThrow(RlsContextError);
      });
    });
  });

  describe('runAsTenant', () => {
    it('runs the callback as the tenant and returns its value', async () => {
      const result = await runAsTenant(7, 'test', async () => currentRls());
      expect(result).toEqual({ kind: 'tenant', tenantId: 7, source: 'test' });
      expect(currentRls()).toBeUndefined();
    });

    it('allows re-entering the same tenant and clears inTx', async () => {
      await rlsStorage.run({ ctx: { kind: 'tenant', tenantId: 7, source: 'jwt' }, inTx: true }, async () => {
        await runAsTenant(7, 'event', async () => {
          expect(rlsStorage.getStore()).toEqual({ ctx: { kind: 'tenant', tenantId: 7, source: 'event' } });
        });
      });
    });

    it('rejects inside a different tenant', async () => {
      await runAsTenant(7, 'outer', async () => {
        await expect(runAsTenant(8, 'inner', async () => 'never')).rejects.toThrow(RlsContextError);
      });
    });

    it('rejects inside a public scope', async () => {
      await runAsPublic('anonymous', async () => {
        await expect(runAsTenant(8, 'inner', async () => 'never')).rejects.toThrow(RlsContextError);
      });
    });

    it('rejects an invalid tenant id', async () => {
      await expect(runAsTenant(0, 'x', async () => 'never')).rejects.toThrow(RlsContextError);
    });

    it('awaits a lazy (Prisma-style) result inside the scope', async () => {
      const seen: unknown[] = [];
      const lazy: PromiseLike<string> = {
        then(onFulfilled, onRejected) {
          seen.push(currentRls());
          return Promise.resolve('rows').then(onFulfilled, onRejected);
        },
      };
      expect(await runAsTenant(7, 'x', () => lazy as Promise<string>)).toBe('rows');
      expect(seen).toEqual([{ kind: 'tenant', tenantId: 7, source: 'x' }]);
    });

    it('may narrow a system scope to one tenant', async () => {
      await rlsStorage.run({ ctx: { kind: 'system', reason: 'outbox-relay' } }, async () => {
        expect(await runAsTenant(8, 'event', async () => currentRls())).toEqual({
          kind: 'tenant',
          tenantId: 8,
          source: 'event',
        });
      });
    });

    it('propagates rejections from the callback', async () => {
      await expect(
        runAsTenant(7, 'x', async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('runAsPublic', () => {
    it('runs the callback in the public scope', async () => {
      expect(await runAsPublic('anonymous', async () => currentRls())).toEqual({ kind: 'public', source: 'anonymous' });
    });

    it('rejects inside a tenant scope', async () => {
      await runAsTenant(7, 'x', async () => {
        await expect(runAsPublic('anonymous', async () => 'never')).rejects.toThrow(RlsContextError);
      });
    });
  });

  describe('runAsTenant and runAsPublic outside strict mode', () => {
    let strict: string | undefined;
    beforeEach(() => {
      strict = process.env.RLS_STRICT_CONTEXT;
      delete process.env.RLS_STRICT_CONTEXT;
    });
    afterEach(() => {
      process.env.RLS_STRICT_CONTEXT = strict;
      jest.restoreAllMocks();
    });

    it('runAsTenant inside a different tenant logs the conflict and runs in the first context', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const seen = await runAsTenant(7, 'outer', () => runAsTenant(8, 'inner', async () => currentRls()));
      expect(seen).toEqual({ kind: 'tenant', tenantId: 7, source: 'outer' });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Cannot run as tenant 8 (inner) inside tenant 7'));
    });

    it('runAsTenant inside a public scope logs the conflict and stays public', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const seen = await runAsPublic('anonymous', () => runAsTenant(8, 'inner', async () => currentRls()));
      expect(seen).toEqual({ kind: 'public', source: 'anonymous' });
      expect(error).toHaveBeenCalledTimes(1);
    });

    it('runAsPublic inside a tenant scope logs the conflict and stays in the tenant', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const seen = await runAsTenant(7, 'jwt', () => runAsPublic('anonymous', async () => currentRls()));
      expect(seen).toEqual({ kind: 'tenant', tenantId: 7, source: 'jwt' });
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Cannot run as public (anonymous) inside tenant 7'));
    });

    it('still awaits a lazy result inside the kept scope', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const seen: unknown[] = [];
      const lazy: PromiseLike<string> = {
        then(onFulfilled, onRejected) {
          seen.push(currentRls());
          return Promise.resolve('rows').then(onFulfilled, onRejected);
        },
      };
      await runAsTenant(7, 'outer', async () => {
        expect(await runAsTenant(8, 'inner', () => lazy as Promise<string>)).toBe('rows');
      });
      expect(seen).toEqual([{ kind: 'tenant', tenantId: 7, source: 'outer' }]);
    });

    it('still rejects an invalid tenant id', async () => {
      await expect(runAsTenant(0, 'x', async () => 'never')).rejects.toThrow(RlsContextError);
    });
  });

  describe('runInJobScope', () => {
    it('replaces an outer tenant with the job tenant', async () => {
      await runAsTenant(7, 'jwt', async () => {
        expect(await runInJobScope(8, 'job', async () => currentRls())).toEqual({
          kind: 'tenant',
          tenantId: 8,
          source: 'job',
        });
        expect(currentRls()).toEqual({ kind: 'tenant', tenantId: 7, source: 'jwt' });
      });
    });

    it('runs with an empty holder when the job names no tenant', async () => {
      await runAsTenant(7, 'jwt', async () => {
        await runInJobScope(undefined, 'job', async () => {
          expect(rlsStorage.getStore()).toEqual({});
        });
      });
    });

    it('rejects an invalid tenant id', async () => {
      await expect(runInJobScope(-3, 'job', async () => 'never')).rejects.toThrow(RlsContextError);
    });
  });

  describe('runInEventScope', () => {
    it('runs the handler as the payload tenant, from a numeric string too, and clears inTx', async () => {
      await rlsStorage.run({ ctx: { kind: 'tenant', tenantId: 7, source: 'jwt' }, inTx: true }, async () => {
        await runInEventScope('7', 'event:x', async () => {
          expect(rlsStorage.getStore()).toEqual({ ctx: { kind: 'tenant', tenantId: 7, source: 'event:x' } });
        });
      });
    });

    it('throws (strict mode) when the emitter ran as another tenant', async () => {
      await runAsTenant(1, 'jwt', async () => {
        await expect(runInEventScope(2, 'event:x', async () => 'never')).rejects.toThrow(
          /tenant 2 was emitted inside tenant 1/,
        );
      });
    });

    it('throws (strict mode) when the payload names no tenant DB id', async () => {
      await expect(runInEventScope('acme-co', 'event:x', async () => 'never')).rejects.toThrow(/carries no tenant id/);
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

      it('logs a payload with no tenant and runs the handler with no context', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        expect(await runInEventScope(undefined, 'event:x', async () => rlsStorage.getStore())).toEqual({});
        expect(error).toHaveBeenCalledWith(expect.stringContaining('carries no tenant id'));
      });

      it('logs an emitter of another tenant and runs as the payload tenant', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const seen = await runAsTenant(1, 'jwt', () => runInEventScope(2, 'event:x', async () => currentRls()));
        expect(seen).toEqual({ kind: 'tenant', tenantId: 2, source: 'event:x' });
        expect(error).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('isRlsStrict', () => {
    it('is on only for RLS_STRICT_CONTEXT=throw', () => {
      expect(isRlsStrict({ RLS_STRICT_CONTEXT: 'throw' })).toBe(true);
      expect(isRlsStrict({ RLS_STRICT_CONTEXT: 'log' })).toBe(false);
      expect(isRlsStrict({})).toBe(false);
    });

    it('is on in the unit-test environment', () => {
      expect(isRlsStrict()).toBe(true);
    });
  });

  describe('isRlsTenantId', () => {
    it.each([
      [1, true],
      [42, true],
      [0, false],
      [-1, false],
      [2.5, false],
      ['5', false],
      [undefined, false],
      [Number.MAX_SAFE_INTEGER + 1, false],
    ])('%p → %p', (value, expected) => {
      expect(isRlsTenantId(value)).toBe(expected);
    });
  });

  describe('toRlsTenantId', () => {
    it.each([
      [7, 7],
      ['7', 7],
      ['1234', 1234],
      ['07', undefined],
      ['0', undefined],
      ['system', undefined],
      ['acme-co', undefined],
      ['7.5', undefined],
      [0, undefined],
      [null, undefined],
    ])('%p → %p', (raw, expected) => {
      expect(toRlsTenantId(raw)).toBe(expected);
    });
  });

  describe('context isolation', () => {
    it('two concurrent flows never see each other’s tenant', async () => {
      const seen: Array<[number, number | undefined]> = [];
      const flow = (tenantId: number) =>
        runAsTenant(tenantId, 'test', async () => {
          for (let i = 0; i < 50; i += 1) {
            await tick();
            const ctx = currentRls();
            seen.push([tenantId, ctx?.kind === 'tenant' ? ctx.tenantId : undefined]);
          }
        });

      await Promise.all([flow(1), flow(2), flow(1), flow(2)]);

      expect(seen).toHaveLength(200);
      expect(seen.filter(([expected, actual]) => expected !== actual)).toEqual([]);
    });

    it('two concurrent requests pinned by setRlsTenant stay isolated', async () => {
      const middleware = new RlsContextMiddleware();
      const request = (tenantId: number) =>
        new Promise<number | undefined>((resolve) => {
          middleware.use({} as never, {} as never, () => {
            void (async () => {
              await tick();
              setRlsTenant(tenantId, 'jwt');
              await tick();
              await tick();
              const ctx = currentRls();
              resolve(ctx?.kind === 'tenant' ? ctx.tenantId : undefined);
            })();
          });
        });

      await expect(Promise.all([request(1), request(2), request(3)])).resolves.toEqual([1, 2, 3]);
    });
  });
});
