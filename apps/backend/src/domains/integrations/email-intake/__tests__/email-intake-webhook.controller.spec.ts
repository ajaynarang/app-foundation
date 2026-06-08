import * as crypto from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailIntakeWebhookController } from '../controllers/email-intake-webhook.controller';
import { EmailIntakeService } from '../services/email-intake.service';

const SECRET_RAW = 'test_webhook_secret_base64_encoded';
const SECRET = `whsec_${Buffer.from(SECRET_RAW).toString('base64')}`;

const mockConfig = {
  get: jest.fn((key: string, fallback?: string) => {
    if (key === 'RESEND_INBOUND_WEBHOOK_SECRET') return SECRET;
    return fallback ?? '';
  }),
};

const mockEmailIntakeService = {
  resolveTenant: jest.fn(),
  processInboundEmail: jest.fn().mockResolvedValue({ threadId: 'thread-1' }),
};

describe('EmailIntakeWebhookController', () => {
  let controller: EmailIntakeWebhookController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailIntakeWebhookController],
      providers: [
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailIntakeService, useValue: mockEmailIntakeService },
      ],
    }).compile();

    controller = module.get<EmailIntakeWebhookController>(EmailIntakeWebhookController);
  });

  // --------------------------------------------------------------------------
  // Resend envelope format
  // --------------------------------------------------------------------------

  describe('handleInbound — Resend envelope', () => {
    it('should process valid Resend webhook', async () => {
      mockEmailIntakeService.resolveTenant.mockResolvedValue({
        tenantId: 1,
        isEnabled: true,
      });

      const body = {
        type: 'email.received',
        data: {
          from: 'broker@example.com',
          to: ['dispatch@company.appshore.in'],
          subject: 'Rate Con',
        },
      };

      const result = await controller.handleInbound({ rawBody: Buffer.from(JSON.stringify(body)) }, body);

      expect(result.status).toBe('accepted');
      expect(mockEmailIntakeService.processInboundEmail).toHaveBeenCalledWith(1, body.data);
    });

    it('should return ignored if no recipient address', async () => {
      const body = {
        type: 'email.received',
        data: { from: 'sender@test.com', to: [] },
      };

      const result = await controller.handleInbound({}, body);

      expect(result.status).toBe('ignored');
      expect(result.reason).toBe('no_recipient');
    });

    it('should return ignored if tenant not found', async () => {
      mockEmailIntakeService.resolveTenant.mockResolvedValue(null);

      const body = {
        type: 'email.received',
        data: { from: 'b@test.com', to: ['unknown@x.com'] },
      };

      const result = await controller.handleInbound({}, body);

      expect(result.status).toBe('ignored');
      expect(result.reason).toBe('unknown_recipient');
    });

    it('should return ignored if email intake is disabled for tenant', async () => {
      mockEmailIntakeService.resolveTenant.mockResolvedValue({
        tenantId: 1,
        isEnabled: false,
      });

      const body = {
        type: 'email.received',
        data: { from: 'b@test.com', to: ['dispatch@company.appshore.in'] },
      };

      const result = await controller.handleInbound({}, body);

      expect(result.status).toBe('ignored');
      expect(result.reason).toBe('disabled');
    });
  });

  // --------------------------------------------------------------------------
  // Legacy flat format
  // --------------------------------------------------------------------------

  describe('handleInbound — legacy format', () => {
    it('should handle flat payload (no Resend envelope)', async () => {
      mockEmailIntakeService.resolveTenant.mockResolvedValue({
        tenantId: 1,
        isEnabled: true,
      });

      const body = {
        from: 'broker@example.com',
        to: ['dispatch@company.appshore.in'],
        subject: 'Rate Con',
      };

      const result = await controller.handleInbound({}, body);

      expect(result.status).toBe('accepted');
      expect(mockEmailIntakeService.processInboundEmail).toHaveBeenCalledWith(1, body);
    });
  });

  // --------------------------------------------------------------------------
  // Svix signature verification
  // --------------------------------------------------------------------------

  describe('handleInbound — Svix signature', () => {
    function computeSignature(svixId: string, svixTimestamp: string, rawBody: string) {
      const secretBytes = Buffer.from(SECRET.replace('whsec_', ''), 'base64');
      const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
      const sig = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64');
      return `v1,${sig}`;
    }

    it('should accept valid Svix signature', async () => {
      mockEmailIntakeService.resolveTenant.mockResolvedValue({
        tenantId: 1,
        isEnabled: true,
      });

      const rawBody = JSON.stringify({
        type: 'email.received',
        data: { from: 'b@test.com', to: ['x@y.com'] },
      });

      const svixId = 'msg_123';
      const svixTimestamp = String(Date.now());
      const svixSignature = computeSignature(svixId, svixTimestamp, rawBody);

      const body = JSON.parse(rawBody);
      const req = { rawBody: Buffer.from(rawBody) };

      const result = await controller.handleInbound(req, body, svixId, svixTimestamp, svixSignature);

      expect(result.status).toBe('accepted');
    });

    it('should throw ForbiddenException for invalid Svix signature', async () => {
      const body = {
        type: 'email.received',
        data: { from: 'b@test.com', to: ['x@y.com'] },
      };
      const req = { rawBody: Buffer.from(JSON.stringify(body)) };

      await expect(
        controller.handleInbound(req, body, 'msg_123', String(Date.now()), 'v1,invalidsignature=='),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should skip verification if secret not configured', async () => {
      mockConfig.get.mockReturnValue(''); // no secret
      mockEmailIntakeService.resolveTenant.mockResolvedValue({
        tenantId: 1,
        isEnabled: true,
      });

      const body = {
        type: 'email.received',
        data: { from: 'b@test.com', to: ['x@y.com'] },
      };
      const req = { rawBody: Buffer.from(JSON.stringify(body)) };

      // Should NOT throw even with bad signature headers
      const result = await controller.handleInbound(req, body, 'msg_123', String(Date.now()), 'v1,badsig');

      expect(result.status).toBe('accepted');
    });

    it('should skip verification if no Svix headers present', async () => {
      mockEmailIntakeService.resolveTenant.mockResolvedValue({
        tenantId: 1,
        isEnabled: true,
      });

      const body = {
        type: 'email.received',
        data: { from: 'b@test.com', to: ['x@y.com'] },
      };

      // No svix headers passed
      const result = await controller.handleInbound({}, body);

      expect(result.status).toBe('accepted');
    });
  });
});
