import { Logger } from '@nestjs/common';
import { AiCredentialStatus } from '@appshore/db';
import { APP_JOB_NAMES } from '../../../../../platform-glue/queue/job-names';
import {
  AiCredentialRevalidationHandler,
  REVALIDATION_CHUNK,
  REVALIDATION_SLICE_MS,
} from '../ai-credential-revalidation.handler';

const JOB = APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE;

interface Row {
  id: number;
  tenantId: number;
  publicId: string;
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, tenantId: 7 + (i % 3), publicId: `aicred_${i + 1}` }));
}

/**
 * A fake fleet: `findMany` honours the cursor, the status filter and `take`, the way Postgres would; each test call
 * advances a fake clock by `probeMs`.
 */
function setup(fleet: Row[], opts: { probeMs?: number; enabled?: boolean } = {}) {
  let now = 1_000_000;
  const clock = () => now;
  const prisma = {
    aiCredential: {
      findMany: jest.fn(async ({ where, take }: any) => {
        expect(where.status).toEqual({ in: [AiCredentialStatus.ACTIVE, AiCredentialStatus.FAILING] });
        return fleet.filter((r) => r.id > (where.id?.gt ?? 0)).slice(0, take);
      }),
    },
  };
  const connect = {
    isEnabled: jest.fn(() => opts.enabled ?? true),
    validate: jest.fn(async () => {
      now += opts.probeMs ?? 1_000;
      return { probe: { ok: true } };
    }),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const handler = new AiCredentialRevalidationHandler(prisma as never, connect as never, queue as never, clock);
  const job = (afterId?: number) =>
    ({ name: JOB, data: { payload: afterId === undefined ? {} : { afterId } } }) as never;
  return { handler, prisma, connect, queue, job };
}

describe('AiCredentialRevalidationHandler (the daily sweep)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('owns the app job name on bulk-ops', () => {
    expect(setup([]).handler.jobNames).toEqual([JOB]);
  });

  it('tests every ACTIVE or FAILING credential once, as the system, five at a time, and finishes in one slice', async () => {
    const { handler, connect, queue, prisma, job } = setup(rows(12), { probeMs: 10 });
    await handler.run(job());
    expect(connect.validate).toHaveBeenCalledTimes(12);
    expect(connect.validate).toHaveBeenCalledWith(7, 'aicred_1', expect.objectContaining({ type: 'system' }));
    // One row past the chunk tells the handler whether more remain, so a sweep that ends on a full chunk enqueues nothing.
    expect(prisma.aiCredential.findMany.mock.calls[0][0].take).toBe(REVALIDATION_CHUNK + 1);
    expect(REVALIDATION_CHUNK).toBe(5);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('one bad credential never stops the batch', async () => {
    const { handler, connect, job } = setup(rows(7), { probeMs: 10 });
    connect.validate.mockRejectedValueOnce(new Error('decrypt blew up'));
    await expect(handler.run(job())).resolves.toBeUndefined();
    expect(connect.validate).toHaveBeenCalledTimes(7);
  });

  it('hands over after two minutes: exactly one continuation, and every credential is tested once across the slices', async () => {
    // 100 credentials at 15 s each, 5 in parallel per chunk (the fake clock counts each probe in turn, so a chunk
    // costs 75 s): two chunks fit in a two-minute slice.
    const fleet = rows(100);
    const { handler, connect, queue, job } = setup(fleet, { probeMs: 15_000 });
    expect(REVALIDATION_SLICE_MS).toBe(120_000);

    await handler.run(job());
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, envelope, options] = queue.add.mock.calls[0];
    expect(name).toBe(JOB);
    const cursor = envelope.payload.afterId;
    expect(cursor).toBe(connect.validate.mock.calls.length);
    expect(options.repeat).toBeUndefined();
    expect(options.jobId).toBe(`${JOB}-after-${cursor}`);
    expect(/^\d+$/.test(options.jobId)).toBe(false);

    // Run the continuations the way the queue would, until the sweep ends.
    let slices = 1;
    while (queue.add.mock.calls.length === slices) {
      const [, next] = queue.add.mock.calls[slices - 1];
      await handler.run(job(next.payload.afterId));
      slices++;
      expect(slices).toBeLessThan(50);
    }
    const tested = connect.validate.mock.calls.map((c) => c[1]);
    expect(tested).toHaveLength(fleet.length);
    expect(new Set(tested).size).toBe(fleet.length);
    expect(slices).toBeGreaterThan(1);
  });

  it('a sweep that fits in its slice enqueues nothing, even when the last chunk ends near the deadline', async () => {
    const { handler, queue, job } = setup(rows(5), { probeMs: 30_000 });
    await handler.run(job());
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does nothing while bring-your-own-key is off (no key to decrypt with)', async () => {
    const { handler, connect, prisma, job } = setup(rows(3), { enabled: false });
    await handler.run(job());
    expect(prisma.aiCredential.findMany).not.toHaveBeenCalled();
    expect(connect.validate).not.toHaveBeenCalled();
  });
});
