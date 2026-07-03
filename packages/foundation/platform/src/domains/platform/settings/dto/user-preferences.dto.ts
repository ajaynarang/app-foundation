import { IsOptional, IsString, IsBoolean, IsIn, IsObject, IsDateString } from 'class-validator';

import { IsIanaTimezone } from '@appshore/kernel/shared/validators/is-iana-timezone.validator';

export class UpdateUserPreferencesDto {
  // Display Preferences
  @IsOptional()
  @IsString()
  @IsIn(['MILES', 'KILOMETERS'])
  distanceUnit?: string;

  @IsOptional()
  @IsString()
  @IsIn(['12H', '24H'])
  timeFormat?: string;

  @IsOptional()
  @IsString()
  @IsIanaTimezone()
  timezone?: string;

  @IsOptional()
  @IsString()
  dateFormat?: string;

  // Alert Delivery
  @IsOptional()
  @IsObject()
  alertChannels?: Record<string, { inApp: boolean; email: boolean; push: boolean; sms: boolean }>;

  @IsOptional()
  @IsObject()
  soundSettings?: Record<string, boolean>;

  // Notification Preferences (redesign)
  @IsOptional()
  @IsObject()
  notificationPreferences?: Record<string, Record<string, boolean>>;

  // Quiet Hours
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  quietHoursEnd?: string;

  // Voice Preferences
  @IsOptional()
  @IsString()
  @IsIn(['manual', 'auto'])
  voiceMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['warm', 'confident', 'calm'])
  voiceId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['slowest', 'slow', 'normal', 'fast', 'fastest'])
  voiceSpeed?: string;

  // Platform Tour
  @IsOptional()
  @IsString()
  @IsIn(['dismissed', 'completed'])
  platformTourStatus?: string;

  @IsOptional()
  @IsDateString()
  platformTourStatusAt?: string;
}
