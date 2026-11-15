import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, Validate } from 'class-validator';
import { Transform } from 'class-transformer';
import type { LoginActivitySummaryQuery } from '@app/shared-types';
import { QueryBool, QueryInt } from '@appshore/kernel/shared/utils/query-dto';
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

  /** Scope to one tenant (the numeric id; the super-admin route only). */
  @QueryInt({ name: 'tenant_id', min: 1, max: 2_147_483_647, description: 'Scope to a specific tenant' })
  tenantId?: number;

  /** Exclude SUPER_ADMIN users from results (the super-admin route only). `true` / `false`. */
  @QueryBool({ name: 'exclude_super_admin', description: 'Exclude SUPER_ADMIN users (super-admin route only)' })
  excludeSuperAdmin?: boolean;
}
