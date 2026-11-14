import { Logger } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { EMAIL_UNIQUE_INDEX } from '@appshore/db/email-uniqueness';
import { AuthModule } from '../auth.module';
import { EMAIL_UNIQUENESS_UNENFORCED_EVENT, EmailUniquenessCheck } from '../email-uniqueness.check';

describe('EmailUniquenessCheck', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const check = (queryRawUnsafe: jest.Mock) => new EmailUniquenessCheck({ $queryRawUnsafe: queryRawUnsafe } as any);

  it('logs one structured warning at boot when the index is absent', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await check(query).onApplicationBootstrap();

    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_index'), EMAIL_UNIQUE_INDEX);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: EMAIL_UNIQUENESS_UNENFORCED_EVENT, index: EMAIL_UNIQUE_INDEX }),
    );
    expect(EMAIL_UNIQUENESS_UNENFORCED_EVENT).toBe('auth.email_uniqueness_unenforced');
  });

  it('stays quiet when the index is there', async () => {
    await check(jest.fn().mockResolvedValue([{ '?column?': 1 }])).onApplicationBootstrap();
    expect(warn).not.toHaveBeenCalled();
  });

  it('never fails the boot when the check itself cannot run', async () => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    await expect(
      check(jest.fn().mockRejectedValue(new Error('connection refused'))).onApplicationBootstrap(),
    ).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalled();
  });

  it('is a provider of AuthModule, so every process that loads auth runs it', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as unknown[];
    expect(providers).toContain(EmailUniquenessCheck);
  });
});
