import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

enum NotificationFrequency {
  IMMEDIATE = 'immediate',
  DAILY = 'daily',
}

export class UpdateSuperAdminPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyNewTenants?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyStatusChanges?: boolean;

  @ApiPropertyOptional({ enum: NotificationFrequency })
  @IsOptional()
  @IsEnum(NotificationFrequency)
  notificationFrequency?: NotificationFrequency;
}
