import { NotFoundException } from '@nestjs/common';
import { UserPreferencesController } from '../user-preferences.controller';

describe('UserPreferencesController', () => {
  let controller: UserPreferencesController;
  let service: any;

  const mockUser = { userId: 'user_abc123' };

  const fullUserPrefs = {
    id: 1,
    userId: 10,
    distanceUnit: 'MILES',
    timeFormat: '12H',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    quietHoursEnabled: false,
    quietHoursStart: null,
    quietHoursEnd: null,
    voiceMode: 'manual',
    voiceId: 'warm',
    voiceSpeed: 'normal',
  };

  beforeEach(() => {
    service = {
      getUserPreferences: jest.fn().mockResolvedValue(fullUserPrefs),
      updateUserPreferences: jest.fn(),
      resetToDefaults: jest.fn(),
    };
    controller = new UserPreferencesController(service);
  });

  // ── GET /settings/general ──

  describe('getUserPreferences', () => {
    it('passes user.userId to service and returns full preference object', async () => {
      const result = await controller.getUserPreferences(mockUser);

      expect(service.getUserPreferences).toHaveBeenCalledWith('user_abc123');
      expect(result).toEqual(fullUserPrefs);
      expect(result.distanceUnit).toBe('MILES');
      expect(result.timeFormat).toBe('12H');
      expect(result.timezone).toBe('America/New_York');
      expect(result.voiceMode).toBe('manual');
      expect(result.voiceSpeed).toBe('normal');
    });

    it('uses userId string from user object, not dbId', async () => {
      const userWithBothIds = { userId: 'firebase-uid', dbId: 42 };
      service.getUserPreferences.mockResolvedValue(fullUserPrefs);

      await controller.getUserPreferences(userWithBothIds);

      expect(service.getUserPreferences).toHaveBeenCalledWith('firebase-uid');
    });

    it('propagates NotFoundException when user not found', async () => {
      service.getUserPreferences.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.getUserPreferences({ userId: 'nonexistent' })).rejects.toThrow(NotFoundException);
    });

    it('returns different preferences for different users', async () => {
      const otherPrefs = {
        ...fullUserPrefs,
        distanceUnit: 'KILOMETERS',
        timeFormat: '24H',
      };
      service.getUserPreferences.mockResolvedValue(otherPrefs);

      const result = await controller.getUserPreferences({
        userId: 'user_other',
      });

      expect(service.getUserPreferences).toHaveBeenCalledWith('user_other');
      expect(result.distanceUnit).toBe('KILOMETERS');
      expect(result.timeFormat).toBe('24H');
    });
  });

  // ── PUT /settings/general ──

  describe('updateUserPreferences', () => {
    it('passes userId and dto to service and returns updated preferences', async () => {
      const dto = { distanceUnit: 'KILOMETERS', timeFormat: '24H' };
      const updated = {
        ...fullUserPrefs,
        distanceUnit: 'KILOMETERS',
        timeFormat: '24H',
      };
      service.updateUserPreferences.mockResolvedValue(updated);

      const result = await controller.updateUserPreferences(mockUser, dto);

      expect(service.updateUserPreferences).toHaveBeenCalledWith('user_abc123', dto);
      expect(result.distanceUnit).toBe('KILOMETERS');
      expect(result.timeFormat).toBe('24H');
      // unchanged fields preserved
      expect(result.timezone).toBe('America/New_York');
      expect(result.voiceMode).toBe('manual');
    });

    it('supports updating voice preferences', async () => {
      const dto = {
        voiceMode: 'auto',
        voiceId: 'confident',
        voiceSpeed: 'fast',
      };
      const updated = { ...fullUserPrefs, ...dto };
      service.updateUserPreferences.mockResolvedValue(updated);

      const result = await controller.updateUserPreferences(mockUser, dto);

      expect(service.updateUserPreferences).toHaveBeenCalledWith('user_abc123', dto);
      expect(result.voiceMode).toBe('auto');
      expect(result.voiceId).toBe('confident');
      expect(result.voiceSpeed).toBe('fast');
    });

    it('propagates NotFoundException for non-existent user', async () => {
      service.updateUserPreferences.mockRejectedValue(new NotFoundException('User not found'));

      await expect(
        controller.updateUserPreferences({ userId: 'ghost' }, {
          timeFormat: '24H',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /settings/reset ──

  describe('resetToDefaults', () => {
    it('passes userId and scope "user" to service for user reset', async () => {
      const defaultUserPrefs = {
        ...fullUserPrefs,
        distanceUnit: 'MILES',
        timeFormat: '12H',
      };
      service.resetToDefaults.mockResolvedValue(defaultUserPrefs);

      const result = await controller.resetToDefaults(mockUser, {
        scope: 'user',
      });

      expect(service.resetToDefaults).toHaveBeenCalledWith('user_abc123', 'user');
      expect(result).toEqual(defaultUserPrefs);
      expect((result as any).distanceUnit).toBe('MILES');
    });

    it('propagates NotFoundException for non-existent user on reset', async () => {
      service.resetToDefaults.mockRejectedValue(new NotFoundException('User not found'));

      await expect(controller.resetToDefaults({ userId: 'ghost' }, { scope: 'user' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates errors for invalid scope', async () => {
      service.resetToDefaults.mockRejectedValue(new Error('Invalid scope'));

      await expect(controller.resetToDefaults(mockUser, { scope: 'invalid' as any })).rejects.toThrow('Invalid scope');
    });
  });
});
