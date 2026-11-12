import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsEnum, IsDateString } from 'class-validator';

export enum AnnouncementTargetType {
  ALL = 'ALL',
  PLAN = 'PLAN',
  TENANT = 'TENANT',
}

export enum AnnouncementPriority {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty()
  @IsString()
  body: string;

  @IsOptional()
  @IsEnum(AnnouncementTargetType)
  targetType?: AnnouncementTargetType = AnnouncementTargetType.ALL;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetIds?: string[] = [];

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority = AnnouncementPriority.INFO;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
