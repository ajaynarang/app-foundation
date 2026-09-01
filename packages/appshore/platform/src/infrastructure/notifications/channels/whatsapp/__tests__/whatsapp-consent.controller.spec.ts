import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WhatsAppConsentController } from '../whatsapp-consent.controller';
import { WhatsAppConsentService } from '../whatsapp-consent.service';

describe('WhatsAppConsentController', () => {
  let controller: WhatsAppConsentController;
  const consent = {
    get: jest.fn().mockResolvedValue({ optedIn: true, marketingOptedIn: false }),
    update: jest.fn().mockResolvedValue({ optedIn: true, marketingOptedIn: false }),
  };
  const user = { dbId: 7, userId: 'usr_7' };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [WhatsAppConsentController],
      providers: [{ provide: WhatsAppConsentService, useValue: consent }],
    }).compile();
    controller = module.get(WhatsAppConsentController);
    jest.clearAllMocks();
  });

  it('GET reads the current user, by db id', async () => {
    await expect(controller.get(user)).resolves.toEqual({ optedIn: true, marketingOptedIn: false });
    expect(consent.get).toHaveBeenCalledWith(7);
  });

  it('PATCH with nothing to change is a 400', async () => {
    await expect(controller.update(user, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(consent.update).not.toHaveBeenCalled();
  });

  it('PATCH from the signup screen records SIGNUP', async () => {
    await controller.update(user, { optedIn: true, source: 'SIGNUP' });
    expect(consent.update).toHaveBeenCalledWith(7, { optedIn: true, marketingOptedIn: undefined }, 'SIGNUP');
  });

  it('PATCH without a source is SETTINGS', async () => {
    await controller.update(user, { optedIn: false });
    expect(consent.update).toHaveBeenCalledWith(7, { optedIn: false, marketingOptedIn: undefined }, 'SETTINGS');
  });
});
