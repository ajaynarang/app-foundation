import type { Job } from 'bullmq';
import { requestContextStorage } from '../request-context.middleware';
import { withJobLogContext } from '../job-log-context';

function makeJob(partial: Partial<Job>): Job {
  return partial as unknown as Job;
}

describe('withJobLogContext', () => {
  it('sets jobName, jobId, and tenantId (from job.data) on the store', async () => {
    const job = makeJob({
      id: 'job-42',
      name: 'samsara-sync',
      data: { tenantId: 7 },
    });

    await withJobLogContext(job, async () => {
      const ctx = requestContextStorage.getStore();
      expect(ctx).toMatchObject({
        jobName: 'samsara-sync',
        jobId: 'job-42',
        tenantId: '7',
      });
    });
  });

  it('falls back to job.id for requestId when no upstream context exists', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: undefined });

    await withJobLogContext(job, async () => {
      expect(requestContextStorage.getStore()?.requestId).toBe('job-1');
    });
  });

  it('preserves upstream requestId when dispatched from an HTTP handler', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: { tenantId: 'a' } });

    await requestContextStorage.run({ requestId: 'req-upstream', tenantId: 'a', userId: 'u1' }, async () => {
      await withJobLogContext(job, async () => {
        const ctx = requestContextStorage.getStore();
        expect(ctx?.requestId).toBe('req-upstream');
        expect(ctx?.userId).toBe('u1');
        expect(ctx?.jobName).toBe('x');
      });
    });
  });

  it('leaves tenantId undefined when neither job.data nor upstream supplies it', async () => {
    const job = makeJob({ id: 'job-1', name: 'scan-all', data: undefined });

    await withJobLogContext(job, async () => {
      expect(requestContextStorage.getStore()?.tenantId).toBeUndefined();
    });
  });

  it('stringifies numeric tenantId', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: { tenantId: 42 } });

    await withJobLogContext(job, async () => {
      expect(requestContextStorage.getStore()?.tenantId).toBe('42');
    });
  });

  it('returns the value produced by the inner function', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: undefined });

    const result = await withJobLogContext(job, async () => 'done');
    expect(result).toBe('done');
  });

  it('propagates rejections from the inner function', async () => {
    const job = makeJob({ id: 'job-1', name: 'x', data: undefined });

    await expect(
      withJobLogContext(job, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('handles jobs without a string id', async () => {
    const job = makeJob({ id: undefined, name: 'no-id', data: undefined });

    await withJobLogContext(job, async () => {
      const ctx = requestContextStorage.getStore();
      expect(ctx?.jobId).toBeUndefined();
      expect(ctx?.requestId).toBe('job');
    });
  });
});
