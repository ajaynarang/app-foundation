import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email.service';

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

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      }).compile();
      service = module.get<EmailService>(EmailService);
    });

    it('should not throw in console mode', async () => {
      await expect(
        service.sendEmail({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('resend mode', () => {
    let service: EmailService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailService,
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
      await service.sendUserInvitation(
        'user@example.com',
        'John',
        'Doe',
        'Admin User',
        'Acme Freight',
        'token-abc-123',
      );

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: expect.stringContaining('Acme Freight'),
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
      await service.sendTenantApprovalEmail('owner@acme.com', 'John', 'Acme Freight', 'acme');

      const html = sendSpy.mock.calls[0][0].html;
      expect(html).toContain('acme.app.appshore.in');
    });
  });
});
