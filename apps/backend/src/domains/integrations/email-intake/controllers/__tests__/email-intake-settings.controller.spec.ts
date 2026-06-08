import { Test, TestingModule } from '@nestjs/testing';
import { EmailIntakeSettingsController } from '../email-intake-settings.controller';
import { EmailIntakeService } from '../../services/email-intake.service';

describe('EmailIntakeSettingsController', () => {
  let controller: EmailIntakeSettingsController;
  let emailIntakeService: any;

  const mockUser = { tenantDbId: 5 };

  beforeEach(async () => {
    emailIntakeService = {
      getSettings: jest.fn(),
      updateSettings: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailIntakeSettingsController],
      providers: [{ provide: EmailIntakeService, useValue: emailIntakeService }],
    }).compile();

    controller = module.get<EmailIntakeSettingsController>(EmailIntakeSettingsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getSettings', () => {
    it('should return settings for the user tenant', async () => {
      const settings = {
        id: 's1',
        tenantId: 5,
        inboundAddress: 'loads-test@inbound.sally.appshore.in',
        isEnabled: true,
        approvedDomains: ['example.com'],
        autoApproveCustomerDomains: true,
        unknownSenderPolicy: 'HOLD',
      };
      emailIntakeService.getSettings.mockResolvedValue(settings);

      const result = await controller.getSettings(mockUser);

      expect(result).toEqual(settings);
      expect(emailIntakeService.getSettings).toHaveBeenCalledWith(5);
    });
  });

  describe('updateSettings', () => {
    it('should update settings with approved domains', async () => {
      const dto = {
        approvedDomains: ['example.com', 'freight.com'],
      };
      const updated = {
        id: 's1',
        tenantId: 5,
        approvedDomains: ['example.com', 'freight.com'],
      };
      emailIntakeService.updateSettings.mockResolvedValue(updated);

      const result = await controller.updateSettings(mockUser, dto);

      expect(result).toEqual(updated);
      expect(emailIntakeService.updateSettings).toHaveBeenCalledWith(5, dto);
    });

    it('should update isEnabled setting', async () => {
      const dto = { isEnabled: false };
      const updated = { id: 's1', tenantId: 5, isEnabled: false };
      emailIntakeService.updateSettings.mockResolvedValue(updated);

      const result = await controller.updateSettings(mockUser, dto);

      expect(result.isEnabled).toBe(false);
    });

    it('should update unknownSenderPolicy', async () => {
      const dto = { unknownSenderPolicy: 'PARSE_ANYWAY' as const };
      const updated = {
        id: 's1',
        tenantId: 5,
        unknownSenderPolicy: 'PARSE_ANYWAY',
      };
      emailIntakeService.updateSettings.mockResolvedValue(updated);

      const result = await controller.updateSettings(mockUser, dto);

      expect(result.unknownSenderPolicy).toBe('PARSE_ANYWAY');
    });

    it('should update autoApproveCustomerDomains', async () => {
      const dto = { autoApproveCustomerDomains: false };
      emailIntakeService.updateSettings.mockResolvedValue({
        id: 's1',
        autoApproveCustomerDomains: false,
      });

      const result = await controller.updateSettings(mockUser, dto);

      expect(result.autoApproveCustomerDomains).toBe(false);
    });
  });
});
