import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SmsService } from '../sms.service';
import { ConfigService } from '@nestjs/config';

describe('SmsService', () => {
  let service: SmsService;

  const mockConfig = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
        TWILIO_AUTH_TOKEN: 'test-auth-token-value',
        TWILIO_PHONE_NUMBER: '+15551234567',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsService, { provide: ConfigService, useValue: mockConfig }],
    }).compile();

    service = module.get<SmsService>(SmsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isConfigured', () => {
    it('should return true when Twilio credentials are set', () => {
      expect(service.getIsConfigured()).toBe(true);
    });
  });
});

describe('SmsService without Twilio', () => {
  let service: SmsService;
  let logged: () => string;
  const originalEnvType = process.env.ENV_TYPE;
  const to = '+15559876543';
  const body = 'Your sign-in code is 482913';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsService, { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } }],
    }).compile();
    service = module.get<SmsService>(SmsService);
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );
    logged = () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnvType === undefined) delete process.env.ENV_TYPE;
    else process.env.ENV_TYPE = originalEnvType;
  });

  it('prints the message with a masked number when ENV_TYPE=development', async () => {
    process.env.ENV_TYPE = 'development';

    await expect(service.sendSms(to, body)).resolves.toBe(false);

    expect(logged()).toContain('482913');
    expect(logged()).toContain('***6543');
    expect(logged()).not.toContain(to);
  });

  it.each(['production', 'sandbox', 'preprod', undefined])(
    'with ENV_TYPE=%s logs one line with a masked number and no body',
    async (envType) => {
      if (envType === undefined) delete process.env.ENV_TYPE;
      else process.env.ENV_TYPE = envType;

      await expect(service.sendSms(to, body)).resolves.toBe(false);

      expect(logged()).toContain('***6543');
      expect(logged()).not.toContain(to);
      expect(logged()).not.toContain('482913');
    },
  );
});

describe('SmsService with Twilio', () => {
  it('masks the number in the success and failure lines', async () => {
    const create = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("The 'To' number +15559876543 is not valid"));
    const config = {
      get: jest.fn(
        (key: string) =>
          ({ TWILIO_ACCOUNT_SID: 'AC0', TWILIO_AUTH_TOKEN: 'secret', TWILIO_PHONE_NUMBER: '+15551234567' })[key],
      ),
    };
    const service = new SmsService(config as unknown as ConfigService);
    // Swap the real client for a stub: no network.
    (service as unknown as { twilioClient: unknown }).twilioClient = { messages: { create } };
    const spies = (['log', 'warn', 'error'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );

    await expect(service.sendSms('+15559876543', 'hello')).resolves.toBe(true);
    await expect(service.sendSms('+15559876543', 'hello')).resolves.toBe(false);

    const lines = spies.flatMap((spy) => spy.mock.calls);
    const text = JSON.stringify(lines.map((args) => (typeof args[0] === 'string' ? args[0] : args[0]?.msg)));
    expect(text).toContain('***6543');
    expect(text).not.toContain('+15559876543');
    jest.restoreAllMocks();
  });
});
