import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { resetTenantLabelsForTesting } from '@appshore/kernel/infrastructure/telemetry/metrics';
import { InMemoryMetrics } from '@appshore/kernel/infrastructure/telemetry/testing/in-memory-metrics';
import { Logger } from '@nestjs/common';
import { OUTBOUND_GATE } from '@appshore/kernel/infrastructure/outbound/outbound-gate.port';
import {
  allowAllOutboundGate,
  holdAllOutboundGate,
} from '@appshore/kernel/infrastructure/outbound/testing/outbound-gate.testing';
import { classifyTwilioOtpError, TwilioVerifyService } from '../twilio-verify.service';

beforeAll(() => {
  process.env.ENV_TYPE = process.env.ENV_TYPE || 'development';
});

describe('TwilioVerifyService', () => {
  let service: TwilioVerifyService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioVerifyService,
        { provide: OUTBOUND_GATE, useValue: allowAllOutboundGate() },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TwilioVerifyService>(TwilioVerifyService);
    configService = module.get(ConfigService);
  });

  describe('mock OTP mode', () => {
    it('should return true when mock OTP matches env var', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'TWILIO_MOCK_OTP') return '1234';
        return undefined;
      });
      const result = await service.checkVerification('+12025551234', '1234');
      expect(result).toBe(true);
    });

    it('should return false when mock OTP does not match', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'TWILIO_MOCK_OTP') return '1234';
        return undefined;
      });
      const result = await service.checkVerification('+12025551234', '9999');
      expect(result).toBe(false);
    });

    it('should not call Twilio when mock OTP is set', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'TWILIO_MOCK_OTP') return '1234';
        return undefined;
      });
      // sendVerification should resolve without throwing (no real Twilio call)
      await expect(service.sendVerification('+12025551234')).resolves.not.toThrow();
    });
  });

  describe('phone validation', () => {
    it('should throw if phone is not E.164 format', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);
      await expect(service.sendVerification('5551234567')).rejects.toThrow('Invalid phone number format');
    });
  });

  describe('app_otp_failed', () => {
    let harness: InMemoryMetrics;
    const verificationChecks = { create: jest.fn() };
    const verifications = { create: jest.fn() };

    beforeEach(() => {
      resetTenantLabelsForTesting();
      harness = InMemoryMetrics.install();
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(configService, 'get').mockReturnValue(undefined);
      Object.assign(service as unknown as Record<string, unknown>, {
        twilioClient: { verify: { v2: { services: () => ({ verificationChecks, verifications }) } } },
        verifyServiceSid: 'VA123',
      });
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await harness.uninstall();
    });

    async function failures(): Promise<Record<string, unknown>> {
      const points = await harness.points('app_otp_failed');
      return Object.fromEntries(points.map((p) => [p.attributes.reason, p.value]));
    }

    it('counts a wrong code as invalid', async () => {
      verificationChecks.create.mockResolvedValueOnce({ status: 'pending' });

      await expect(service.checkVerification('+12025551234', '000000')).resolves.toBe(false);

      expect(await failures()).toEqual({ invalid: 1 });
    });

    it('counts a send the provider refused as provider, and does not count an approved check', async () => {
      verifications.create.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 20500 }));
      verificationChecks.create.mockResolvedValueOnce({ status: 'approved' });

      await expect(service.sendVerification('+12025551234')).rejects.toThrow('Failed to send verification code');
      await expect(service.checkVerification('+12025551234', '123456')).resolves.toBe(true);

      expect(await failures()).toEqual({ provider: 1 });
    });

    it('classifies rate limits and an expired verification apart from an outage', () => {
      expect(classifyTwilioOtpError({ code: 60203 }, 'send')).toBe('rate_limited');
      expect(classifyTwilioOtpError({ code: 20404 }, 'check')).toBe('invalid');
      expect(classifyTwilioOtpError({ code: 20404 }, 'send')).toBe('provider');
      expect(classifyTwilioOtpError(new Error('ECONNRESET'), 'check')).toBe('provider');
    });
  });

  describe('behind the outbound gate', () => {
    const verifications = { create: jest.fn() };

    beforeEach(() => {
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      jest.spyOn(configService, 'get').mockReturnValue(undefined);
      Object.assign(service as unknown as Record<string, unknown>, {
        twilioClient: { verify: { v2: { services: () => ({ verifications }) } } },
        verifyServiceSid: 'VA123',
      });
    });

    afterEach(() => jest.restoreAllMocks());

    it('does not ask Twilio to text a held-back number', async () => {
      const gate = holdAllOutboundGate();
      (service as unknown as { outboundGate: unknown }).outboundGate = gate;

      await expect(service.sendVerification('+12025551234')).resolves.toBeUndefined();

      expect(verifications.create).not.toHaveBeenCalled();
      expect(gate.held).toEqual([{ method: 'allowPhone', recipient: '+12025551234' }]);
    });

    it('texts an allowed number', async () => {
      verifications.create.mockResolvedValueOnce({});

      await service.sendVerification('+12025551234');

      expect(verifications.create).toHaveBeenCalledWith({ to: '+12025551234', channel: 'sms' });
    });
  });
});
