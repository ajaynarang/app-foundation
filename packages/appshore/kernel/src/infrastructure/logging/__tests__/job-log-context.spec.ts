import type { Job } from 'bullmq';
import { requestContextStorage } from '../request-context.middleware';
import { SYSTEM_JOB_TENANT, resolveJobTenant, withJobContext, withJobLogContext } from '../job-log-context';

function makeJob(partial: Partial<Job>): Job {
  return partial as unknown as Job;
}

describe('withJobContext', () => {
  it('sets jobName, jobId, and tenantId (from job.data) on the store', async () => {
    const job = makeJob({ id: 'job-42', name: 'vendor-sync', data: { tenantId: 7 } });

    await withJobContext(job, async () => {
      expect(requestContextStorage.getStore()).toMatchObject({
        jobName: 'vendor-sync',
        jobId: 'job-42',
        tenantId: '7',
        tenantDbId: '7',
      });
    });
  });

  it('falls back to job.id for requestId when no upstream context exists', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: undefined });

    await withJobContext(job, async () => {
      expect(requestContextStorage.getStore()?.requestId).toBe('job-1');
    });
  });

  it('preserves upstream requestId when dispatched from an HTTP handler', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: { tenantId: 'a' } });

    await requestContextStorage.run({ requestId: 'req-upstream', tenantId: 'a', userId: 'u1' }, async () => {
      await withJobContext(job, async () => {
        const ctx = requestContextStorage.getStore();
        expect(ctx?.requestId).toBe('req-upstream');
        expect(ctx?.userId).toBe('u1');
        expect(ctx?.jobName).toBe('x');
      });
    });
  });

  it('leaves tenantId undefined when neither job.data nor upstream supplies it', async () => {
    const job = makeJob({ id: 'job-1', name: 'scan-all', data: undefined });

    await withJobContext(job, async () => {
      expect(requestContextStorage.getStore()?.tenantId).toBeUndefined();
    });
  });

  it('returns the value produced by the inner function', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: undefined });

    await expect(withJobContext(job, async () => 'done')).resolves.toBe('done');
  });

  it('propagates rejections from the inner function', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: undefined });

    await expect(
      withJobContext(job, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('handles jobs without an id', async () => {
    const job = makeJob({ id: undefined, name: 'no-id', data: undefined });

    await withJobContext(job, async () => {
      const ctx = requestContextStorage.getStore();
      expect(ctx?.jobId).toBeUndefined();
      expect(ctx?.requestId).toBe('job');
    });
  });

  it("logs the job's own tenant over an enclosing request's", async () => {
    const job = makeJob({ id: 'j', name: 'x', data: { tenantId: 'acme', tenantDbId: 9 } });

    await requestContextStorage.run({ requestId: 'req-1', tenantId: 'demo', tenantDbId: '5' }, async () => {
      await withJobContext(job, async () => {
        expect(requestContextStorage.getStore()).toMatchObject({
          requestId: 'req-1',
          tenantId: 'acme',
          tenantDbId: '9',
        });
      });
    });
  });

  it("never pairs the job's public tenant id with the enclosing request's numeric id", async () => {
    const job = makeJob({ id: 'j', name: 'x', data: { tenantId: 'acme' } });

    await requestContextStorage.run({ requestId: 'req-1', tenantId: 'demo', tenantDbId: '5' }, async () => {
      await withJobContext(job, async () => {
        expect(requestContextStorage.getStore()).toMatchObject({ tenantId: 'acme', tenantDbId: undefined });
      });
    });
  });

  it("keeps the enclosing request's tenant when the job names none", async () => {
    const job = makeJob({ id: 'j', name: 'x', data: undefined });

    await requestContextStorage.run({ requestId: 'req-1', tenantId: 'demo', tenantDbId: '5' }, async () => {
      await withJobContext(job, async () => {
        expect(requestContextStorage.getStore()).toMatchObject({ tenantId: 'demo', tenantDbId: '5' });
      });
    });
  });

  it('keeps two concurrent jobs isolated', async () => {
    const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
    const run = (tenantId: number) =>
      withJobContext(makeJob({ id: String(tenantId), name: 'x', data: { tenantId } }), async () => {
        await tick();
        await tick();
        return requestContextStorage.getStore()?.tenantId;
      });

    await expect(Promise.all([run(1), run(2), run(3)])).resolves.toEqual(['1', '2', '3']);
  });

  it('keeps the old name as an alias for one release', () => {
    expect(withJobLogContext).toBe(withJobContext);
  });
});

describe('resolveJobTenant', () => {
  const tenantOf = (data: unknown) => resolveJobTenant(makeJob({ name: 'x', data } as Partial<Job>));

  it('returns the raw tenantId for logging alongside the numeric id', () => {
    expect(tenantOf({ tenantId: '12' })).toEqual({ tenantDbId: 12, logTenantId: '12' });
  });

  it('prefers the envelope tenantDbId when tenantId is a public id', () => {
    expect(tenantOf({ tenantId: 'acme', tenantDbId: 5 })).toEqual({ tenantDbId: 5, logTenantId: 'acme' });
  });

  it('names no numeric tenant when tenantDbId and a numeric tenantId disagree', () => {
    expect(tenantOf({ tenantId: '3', tenantDbId: 4 })).toEqual({ logTenantId: '3' });
  });

  it.each([[{ tenantId: SYSTEM_JOB_TENANT }], [{ tenantId: '0' }], [{ tenantId: '07' }], [{ tenantId: -4 }]])(
    'names no numeric tenant for %p',
    (data) => {
      expect(tenantOf(data).tenantDbId).toBeUndefined();
    },
  );

  it('names no tenant at all for an empty payload', () => {
    expect(tenantOf(undefined)).toEqual({ tenantDbId: undefined, logTenantId: undefined });
    expect(tenantOf({})).toEqual({ tenantDbId: undefined, logTenantId: undefined });
  });
});
