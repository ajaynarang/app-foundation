import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

enum NotificationFrequency {
  IMMEDIATE = 'immediate',
  DAILY = 'daily',
}

export class UpdateSuperAdminPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notifyNewTenants?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyStatusChanges?: boolean;

  @IsOptional()
  @IsEnum(NotificationFrequency)
  notificationFrequency?: NotificationFrequency;
}
