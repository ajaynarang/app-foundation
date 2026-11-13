import { Logger } from '@nestjs/common';
import { APP_JOB_NAMES } from '../../../../../platform-glue/queue/job-names';
import { AiCredentialRevalidationJob, REVALIDATE_EVERY_MS } from '../ai-credential-revalidation.job';

const JOB = APP_JOB_NAMES.BULK_OPS.AI_CREDENTIAL_REVALIDATE;

describe('AiCredentialRevalidationJob', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('registers one daily repeatable sweep on bulk-ops, replacing an older registration', async () => {
    const queue = {
      getRepeatableJobs: jest.fn().mockResolvedValue([
        { name: JOB, key: 'old-key' },
        { name: 'other-job', key: 'keep' },
      ]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
    };
    await new AiCredentialRevalidationJob(queue as never).onModuleInit();
    expect(queue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old-key');
    const [name, envelope, options] = queue.add.mock.calls[0];
    expect(name).toBe(JOB);
    expect(envelope.payload).toEqual({});
    expect(options).toMatchObject({ jobId: JOB, repeat: { every: REVALIDATE_EVERY_MS } });
    expect(REVALIDATE_EVERY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('never blocks boot when the queue is down', async () => {
    const queue = { getRepeatableJobs: jest.fn().mockRejectedValue(new Error('redis down')) };
    await expect(new AiCredentialRevalidationJob(queue as never).onModuleInit()).resolves.toBeUndefined();
  });
});
