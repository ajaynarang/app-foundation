import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SuperAdminPreferencesService } from '../super-admin-preferences.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('SuperAdminPreferencesService', () => {
  let service: SuperAdminPreferencesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      superAdminPreferences: { upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SuperAdminPreferencesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SuperAdminPreferencesService>(SuperAdminPreferencesService);
  });

  describe('getPreferences', () => {
    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getPreferences('user_bad')).rejects.toThrow(NotFoundException);
    });

    it('should upsert and return preferences for existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.superAdminPreferences.upsert.mockResolvedValue({
        notifyNewTenants: true,
        notifyStatusChanges: true,
        notificationFrequency: 'immediate',
      });

      const result = await service.getPreferences('user_1');

      expect(result).toEqual({
        notifyNewTenants: true,
        notifyStatusChanges: true,
        notificationFrequency: 'immediate',
      });
    });
  });

  describe('updatePreferences', () => {
    it('should throw NotFoundException when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePreferences('user_bad', {
          notifyNewTenants: false,
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update specific preferences', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 1 });
      prisma.superAdminPreferences.upsert.mockResolvedValue({
        notifyNewTenants: false,
        notifyStatusChanges: true,
        notificationFrequency: 'daily',
      });

      const result = await service.updatePreferences('user_1', {
        notifyNewTenants: false,
        notificationFrequency: 'daily',
      } as any);

      expect(result.notifyNewTenants).toBe(false);
      expect(result.notificationFrequency).toBe('daily');
    });
  });
});
