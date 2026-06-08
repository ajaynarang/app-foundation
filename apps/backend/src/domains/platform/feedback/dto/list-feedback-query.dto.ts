import { IsOptional, IsString, IsInt, IsDateString, IsIn, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FeedbackStatusEnum, type FeedbackStatus } from '@sally/shared-types';

const FEEDBACK_STATUSES = FeedbackStatusEnum.options;

export class ListFeedbackQueryDto {
  // Canonical uppercase enum — passed straight to the Prisma `status` filter, so it
  // MUST match the FeedbackStatus enum values (NEW/REVIEWED/RESOLVED), not lowercase.
  @ApiPropertyOptional({ enum: FEEDBACK_STATUSES })
  @IsOptional()
  @IsString()
  @IsIn(FEEDBACK_STATUSES)
  status?: FeedbackStatus;

  @ApiPropertyOptional({ enum: ['bug', 'idea', 'general', 'uncategorized'] })
  @IsOptional()
  @IsString()
  @IsIn(['bug', 'idea', 'general', 'uncategorized'])
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tenantId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  sentimentMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  sentimentMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
