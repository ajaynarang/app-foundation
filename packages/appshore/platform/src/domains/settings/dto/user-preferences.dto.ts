import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsIn, IsObject, IsDateString } from 'class-validator';

import { IsIanaTimezone } from '@appshore/kernel/shared/validators/is-iana-timezone.validator';

export class UpdateUserPreferencesDto {
  // Display Preferences
  @ApiPropertyOptional({ enum: ['MILES', 'KILOMETERS'] })
  @IsOptional()
  @IsString()
  @IsIn(['MILES', 'KILOMETERS'])
  distanceUnit?: string;

  @ApiPropertyOptional({ enum: ['12H', '24H'] })
  @IsOptional()
  @IsString()
  @IsIn(['12H', '24H'])
  timeFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsIanaTimezone()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFormat?: string;

  // Alert Delivery
  @IsOptional()
  @IsObject()
  alertChannels?: Record<string, { inApp: boolean; email: boolean; push: boolean; sms: boolean }>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  soundSettings?: Record<string, boolean>;

  // Notification Preferences (redesign)
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  notificationPreferences?: Record<string, Record<string, boolean>>;

  // Quiet Hours
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quietHoursStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quietHoursEnd?: string;

  // Voice Preferences
  @ApiPropertyOptional({ enum: ['manual', 'auto'] })
  @IsOptional()
  @IsString()
  @IsIn(['manual', 'auto'])
  voiceMode?: string;

  @ApiPropertyOptional({ enum: ['warm', 'confident', 'calm'] })
  @IsOptional()
  @IsString()
  @IsIn(['warm', 'confident', 'calm'])
  voiceId?: string;

  @ApiPropertyOptional({ enum: ['slowest', 'slow', 'normal', 'fast', 'fastest'] })
  @IsOptional()
  @IsString()
  @IsIn(['slowest', 'slow', 'normal', 'fast', 'fastest'])
  voiceSpeed?: string;

  // Platform Tour
  @ApiPropertyOptional({ enum: ['dismissed', 'completed'] })
  @IsOptional()
  @IsString()
  @IsIn(['dismissed', 'completed'])
  platformTourStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  platformTourStatusAt?: string;
}
