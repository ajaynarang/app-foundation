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
  @IsString()
  title: string;

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

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
