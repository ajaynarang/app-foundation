import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TwilioVerifyService } from '../twilio-verify.service';

describe('TwilioVerifyService', () => {
  let service: TwilioVerifyService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioVerifyService,
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
});
