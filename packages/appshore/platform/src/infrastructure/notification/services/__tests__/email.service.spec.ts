import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { InMemoryMetrics } from '@appshore/kernel/infrastructure/telemetry/testing/in-memory-metrics';
import { OUTBOUND_GATE, type OutboundGate } from '@appshore/kernel/infrastructure/outbound/outbound-gate.port';
import {
  allowAllOutboundGate,
  holdAllOutboundGate,
} from '@appshore/kernel/infrastructure/outbound/testing/outbound-gate.testing';
import { EmailNotConfiguredError, EmailService } from '../email.service';
import { ResendRefusedError } from '../resend-delivery';

// Mock resend and nodemailer
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'msg-1' }) },
  })),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
  }),
}));

describe('EmailService', () => {
  describe('console mode (no providers)', () => {
    let service: EmailService;
    let logged: () => string;
    const originalEnvType = process.env.ENV_TYPE;
    const message = {
      to: 'Person@Example.com',
      cc: ['copy@example.com'],
      replyTo: 'reply@example.com',
      subject: 'Reset your password',
      html: '<p><a href="http://localhost:3000/reset-password?token=raw-secret-token">Reset</a></p>',
      text: 'Reset: http://localhost:3000/reset-password?token=raw-secret-token',
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: OUTBOUND_GATE, useValue: allowAllOutboundGate() },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();
      service = module.get<EmailService>(EmailService);
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

    it('prints the message with masked addresses when ENV_TYPE=development', async () => {
      process.env.ENV_TYPE = 'development';

      await expect(service.sendEmail(message)).resolves.toBeUndefined();

      expect(logged()).toContain('Reset your password');
      expect(logged()).toContain('reset-password?token=raw-secret-token');
      expect(logged()).toContain('p***@example.com');
      expect(logged()).not.toContain('Person@Example.com');
      expect(logged()).not.toContain('copy@example.com');
      expect(logged()).not.toContain('reply@example.com');
    });

    it.each(['production', 'sandbox', 'preprod', undefined])(
      'with ENV_TYPE=%s throws EmailNotConfiguredError and logs no recipient, body or link',
      async (envType) => {
        if (envType === undefined) delete process.env.ENV_TYPE;
        else process.env.ENV_TYPE = envType;

        await expect(service.sendEmail(message)).rejects.toBeInstanceOf(EmailNotConfiguredError);

        const text = logged();
        expect(text).not.toContain('raw-secret-token');
        expect(text).not.toContain('reset-password');
        expect(text).not.toContain('Person@Example.com');
        expect(text.toLowerCase()).not.toContain('person@example.com');
        expect(text).not.toContain('copy@example.com');
        expect(text).not.toContain('Reset:');
      },
    );
  });

  describe('resend mode', () => {
    let service: EmailService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: OUTBOUND_GATE, useValue: allowAllOutboundGate() },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'RESEND_API_KEY') return 'test-api-key';
                if (key === 'EMAIL_FROM') return 'noreply@test.com';
                return undefined;
              }),
            },
          },
        ],
      }).compile();
      service = module.get<EmailService>(EmailService);
    });

    it('should send email via Resend', async () => {
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Hello',
        html: '<p>World</p>',
      });

      // If no error, send was successful
    });
  });

  describe('sendUserInvitation', () => {
    let service: EmailService;
    let sendSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: OUTBOUND_GATE, useValue: allowAllOutboundGate() },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'APP_URL') return 'https://app.example.com';
                return undefined;
              }),
            },
          },
        ],
      }).compile();
      service = module.get<EmailService>(EmailService);
      sendSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue(undefined);
    });

    it('should include accept URL with invitation token', async () => {
      await service.sendUserInvitation('user@example.com', 'John', 'Doe', 'Admin User', 'Acme Inc', 'token-abc-123');

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Acme Inc'),
        }),
      );

      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.html).toContain('token-abc-123');
      expect(callArgs.text).toContain('token-abc-123');
    });
  });

  describe('sendTenantApprovalEmail', () => {
    let service: EmailService;
    let sendSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: OUTBOUND_GATE, useValue: allowAllOutboundGate() },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'TENANT_BASE_URL') return 'app.appshore.in';
                if (key === 'USE_TENANT_SUBDOMAINS') return true;
                return undefined;
              }),
            },
          },
        ],
      }).compile();
      service = module.get<EmailService>(EmailService);
      sendSpy = jest.spyOn(service, 'sendEmail').mockResolvedValue(undefined);
    });

    it('should generate subdomain-based login URL', async () => {
      await service.sendTenantApprovalEmail('owner@acme.com', 'John', 'Acme Inc', 'acme');

      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('acme.app.appshore.in');
    });
  });
});

describe('EmailService failures count in app_outbound_failed', () => {
  let harness: InMemoryMetrics;
  const originalEnvType = process.env.ENV_TYPE;

  beforeEach(() => {
    harness = InMemoryMetrics.install();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await harness.uninstall();
    if (originalEnvType === undefined) delete process.env.ENV_TYPE;
    else process.env.ENV_TYPE = originalEnvType;
  });

  it('counts a send with no provider outside development as one failed email', async () => {
    process.env.ENV_TYPE = 'sandbox';
    const service = new EmailService(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      allowAllOutboundGate(),
    );

    await expect(service.sendEmail({ to: 'a@example.com', subject: 's', html: '<p/>' })).rejects.toThrow(
      EmailNotConfiguredError,
    );

    expect(await harness.points('app_outbound_failed')).toEqual([
      expect.objectContaining({ attributes: { channel: 'email' }, value: 1 }),
    ]);
  });

  it('counts nothing for the development console path', async () => {
    process.env.ENV_TYPE = 'development';
    const service = new EmailService(
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      allowAllOutboundGate(),
    );

    await service.sendEmail({ to: 'a@example.com', subject: 's', html: '<p/>' });

    expect(await harness.points('app_outbound_failed')).toEqual([]);
  });
});

describe('EmailService behind the outbound gate', () => {
  const originalEnvType = process.env.ENV_TYPE;
  let harness: InMemoryMetrics;
  let send: jest.Mock;

  const resendConfig = {
    get: jest.fn((key: string) => (key === 'RESEND_API_KEY' ? 'test-api-key' : undefined)),
  } as unknown as ConfigService;

  function withResend(gate: OutboundGate) {
    const service = new EmailService(resendConfig, gate);
    send = jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null });
    (service as unknown as { resendClient: unknown }).resendClient = { emails: { send } };
    return service;
  }

  beforeEach(() => {
    harness = InMemoryMetrics.install();
    (['log', 'warn', 'error'] as const).forEach((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await harness.uninstall();
    if (originalEnvType === undefined) delete process.env.ENV_TYPE;
    else process.env.ENV_TYPE = originalEnvType;
  });

  it('does not call the provider for a held-back recipient, and does not fail the send', async () => {
    const gate = holdAllOutboundGate();
    const service = withResend(gate);

    await expect(service.sendEmail({ to: 'a@customer.test', subject: 's', html: '<p/>' })).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
    expect(gate.held).toEqual([{ method: 'gateEmail', recipient: 'a@customer.test' }]);
    expect(await harness.points('app_outbound_failed')).toEqual([]);
  });

  it('sends the message the gate returns (staging subject, recipients dropped)', async () => {
    const gate: OutboundGate = {
      ...allowAllOutboundGate(),
      gateEmail: async (message) => ({ ...message, cc: [], subject: `[STAGING] ${message.subject}` }),
    };
    const service = withResend(gate);

    await service.sendEmail({ to: 'qa@example.com', cc: ['buyer@customer.test'], subject: 'Hello', html: '<p/>' });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'qa@example.com', subject: '[STAGING] Hello' }));
    expect(send.mock.calls[0][0].cc).toBeUndefined();
  });

  it('never asks the gate on the development console path', async () => {
    process.env.ENV_TYPE = 'development';
    const gate = holdAllOutboundGate();
    const service = new EmailService({ get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService, gate);

    await service.sendEmail({ to: 'a@customer.test', subject: 's', html: '<p/>' });

    expect(gate.held).toEqual([]);
  });

  it('throws on a Resend refusal and counts it once, so the ledger records FAILED, not SENT', async () => {
    const service = withResend(allowAllOutboundGate());
    send.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'bad a@x.test', statusCode: 422 },
    });

    await expect(service.sendEmail({ to: 'a@x.test', subject: 's', html: '<p/>' })).rejects.toBeInstanceOf(
      ResendRefusedError,
    );

    expect(await harness.points('app_outbound_failed')).toEqual([
      expect.objectContaining({ attributes: { channel: 'email' }, value: 1 }),
    ]);
  });
});
