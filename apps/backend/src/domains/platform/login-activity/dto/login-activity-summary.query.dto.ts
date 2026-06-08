import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, Validate } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { LoginActivitySummaryQuery } from '@app/shared-types';
import { RangeNotOver90Days } from './list-login-activity.query.dto';

export class LoginActivitySummaryQueryDto implements LoginActivitySummaryQuery {
  @ApiProperty({ example: '2026-05-19', description: 'Range start (ISO date)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-05-26', description: 'Range end (ISO date)' })
  @IsDateString()
  @Validate(RangeNotOver90Days)
  to!: string;

  @ApiProperty({
    required: false,
    isArray: true,
    type: String,
    description: 'Filter by user role(s)',
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value !== undefined ? [value] : undefined))
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @ApiProperty({ required: false, description: 'Scope to a specific tenant' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tenantId?: number;

  @ApiProperty({
    required: false,
    description: 'Exclude SUPER_ADMIN users from results (Super Admin endpoint only)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  excludeSuperAdmin?: boolean;
}
