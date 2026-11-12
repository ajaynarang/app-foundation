import { Logger } from '@nestjs/common';
import { AiCredentialRefusalRecorder, creditRefusedClaimKey } from '../ai-credential-refusal.recorder';

describe('AiCredentialRefusalRecorder (a provider credit refusal on a workspace key)', () => {
  const row = { type: 'ANTHROPIC_KEY', lastFour: 'abcd' };

  function setup(claimed = true) {
    const prisma = {
      aiCredential: {
        findFirst: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const cache = { claim: jest.fn().mockResolvedValue(claimed) };
    const notifications = { aiCredentialFailing: jest.fn().mockResolvedValue(undefined) };
    const recorder = new AiCredentialRefusalRecorder(prisma as never, cache as never, notifications as never);
    return { recorder, prisma, cache, notifications };
  }

  afterEach(() => jest.restoreAllMocks());

  it('stores the redacted reason as lastError, leaves the status alone, and tells the owner', async () => {
    const { recorder, prisma, cache, notifications } = setup();
    await recorder.recordCreditRefusal(
      7,
      'aicred_test000001',
      'credit balance is too low for sk-ant-api03-SECRETSECRET',
    );

    expect(cache.claim).toHaveBeenCalledWith(creditRefusedClaimKey('aicred_test000001'), true, expect.any(Number));
    const update = prisma.aiCredential.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ tenantId: 7, publicId: 'aicred_test000001' });
    expect(update.data).not.toHaveProperty('status');
    expect(update.data.lastError).toContain('credit');
    expect(update.data.lastError).not.toContain('SECRETSECRET');
    expect(notifications.aiCredentialFailing).toHaveBeenCalledWith(7, row, 'credit-refused');
  });

  it('records and notifies at most once a day per credential', async () => {
    const { recorder, prisma, notifications } = setup(false);
    await recorder.recordCreditRefusal(7, 'aicred_test000001', 'insufficient_quota');
    expect(prisma.aiCredential.updateMany).not.toHaveBeenCalled();
    expect(notifications.aiCredentialFailing).not.toHaveBeenCalled();
  });

  it('never throws: a failure is logged and the AI call keeps its own error', async () => {
    const { recorder, prisma } = setup();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prisma.aiCredential.updateMany.mockRejectedValue(new Error('db down'));
    await expect(recorder.recordCreditRefusal(7, 'aicred_test000001', '402')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('does nothing for a credential that is gone', async () => {
    const { recorder, prisma, notifications } = setup();
    prisma.aiCredential.findFirst.mockResolvedValue(null);
    await recorder.recordCreditRefusal(7, 'aicred_gone000000', '402');
    expect(notifications.aiCredentialFailing).not.toHaveBeenCalled();
  });
});
