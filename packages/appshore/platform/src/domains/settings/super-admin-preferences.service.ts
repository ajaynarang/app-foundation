import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UpdateSuperAdminPreferencesDto } from './dto/super-admin-preferences.dto';

@Injectable()
export class SuperAdminPreferencesService {
  private readonly logger = new Logger(SuperAdminPreferencesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get super admin preferences (creates defaults if not exist)
   */
  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const preferences = await this.prisma.superAdminPreferences.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        notifyNewTenants: true,
        notifyStatusChanges: true,
        notificationFrequency: 'immediate',
      },
    });

    return {
      notifyNewTenants: preferences.notifyNewTenants,
      notifyStatusChanges: preferences.notifyStatusChanges,
      notificationFrequency: preferences.notificationFrequency,
    };
  }

  /**
   * Update super admin preferences
   */
  async updatePreferences(userId: string, dto: UpdateSuperAdminPreferencesDto) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const preferences = await this.prisma.superAdminPreferences.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        notifyNewTenants: dto.notifyNewTenants ?? true,
        notifyStatusChanges: dto.notifyStatusChanges ?? true,
        notificationFrequency: dto.notificationFrequency ?? 'immediate',
      },
      update: {
        ...(dto.notifyNewTenants !== undefined && {
          notifyNewTenants: dto.notifyNewTenants,
        }),
        ...(dto.notifyStatusChanges !== undefined && {
          notifyStatusChanges: dto.notifyStatusChanges,
        }),
        ...(dto.notificationFrequency !== undefined && {
          notificationFrequency: dto.notificationFrequency,
        }),
      },
    });

    return {
      notifyNewTenants: preferences.notifyNewTenants,
      notifyStatusChanges: preferences.notifyStatusChanges,
      notificationFrequency: preferences.notificationFrequency,
    };
  }
}
