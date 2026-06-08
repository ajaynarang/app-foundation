import { SendSmsTool } from '../send-sms.tool';

describe('SendSmsTool', () => {
  let tool: SendSmsTool;
  let mockSmsService: { sendSms: jest.Mock };

  beforeEach(() => {
    mockSmsService = {
      sendSms: jest.fn().mockResolvedValue(true),
    };
    tool = new SendSmsTool(mockSmsService as any);
  });

  it('sends via SmsService on happy path and returns ok:true with messageId=null', async () => {
    const result = await tool.execute({
      to: '+15551234567',
      message: 'Your CDL expires in 5 days — please renew ASAP.',
      _tenantId: 17,
    });

    expect(mockSmsService.sendSms).toHaveBeenCalledWith(
      '+15551234567',
      'Your CDL expires in 5 days — please renew ASAP.',
    );
    expect(result).toEqual({ ok: true, messageId: null });
  });

  it('returns sms_not_configured (non-retriable) when SmsService.sendSms returns false', async () => {
    mockSmsService.sendSms.mockResolvedValueOnce(false);
    const result = await tool.execute({
      to: '+15551234567',
      message: 'Hello',
      _tenantId: 17,
    });
    expect(result).toEqual({
      ok: false,
      error: 'sms_not_configured',
      retriable: false,
    });
  });

  it('rejects obviously-invalid phone strings (Zod regex)', async () => {
    const { SendSmsParamsSchema } = await import('../send-sms.tool');
    expect(() =>
      SendSmsParamsSchema.parse({
        to: 'call-me-maybe',
        message: 'Hi',
        _tenantId: 17,
      }),
    ).toThrow();
  });

  it('rejects non-E.164 formats (PR-2 review nitpick — strict regex)', async () => {
    const { SendSmsParamsSchema } = await import('../send-sms.tool');
    for (const bad of [
      '+1 (555) 123-4567', // has spaces + parens
      '555-123-4567', // missing +
      '+0551234567', // starts with 0 after +
      '+1', // too short
    ]) {
      expect(() =>
        SendSmsParamsSchema.parse({
          to: bad,
          message: 'Hi',
          _tenantId: 17,
        }),
      ).toThrow();
    }
  });

  it('requires _tenantId (schema marks it as required)', async () => {
    const { SendSmsParamsSchema } = await import('../send-sms.tool');
    expect(() =>
      SendSmsParamsSchema.parse({
        to: '+15551234567',
        message: 'Hi',
      }),
    ).toThrow();
  });

  it('rejects empty message body (min length)', async () => {
    const { SendSmsParamsSchema } = await import('../send-sms.tool');
    expect(() =>
      SendSmsParamsSchema.parse({
        to: '+15551234567',
        message: '',
        _tenantId: 17,
      }),
    ).toThrow();
  });

  it('returns retriable=true on transient SmsService exceptions (5xx / timeout / ECONNRESET)', async () => {
    mockSmsService.sendSms.mockRejectedValueOnce(new Error('Twilio returned 503 Service Unavailable'));
    const r = await tool.execute({
      to: '+15551234567',
      message: 'Hi',
      _tenantId: 17,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.retriable).toBe(true);

    mockSmsService.sendSms.mockRejectedValueOnce(new Error('socket ECONNRESET'));
    const r2 = await tool.execute({
      to: '+15551234567',
      message: 'Hi',
      _tenantId: 17,
    });
    expect(r2.ok).toBe(false);
    expect(r2.ok === false && r2.retriable).toBe(true);
  });

  it('returns retriable=false on hard failures (e.g. invalid credentials)', async () => {
    mockSmsService.sendSms.mockRejectedValueOnce(new Error('Authenticate — invalid Twilio account SID'));
    const result = await tool.execute({
      to: '+15551234567',
      message: 'Hi',
      _tenantId: 17,
    });
    expect(result).toEqual({
      ok: false,
      error: 'Authenticate — invalid Twilio account SID',
      retriable: false,
    });
  });
});
