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
