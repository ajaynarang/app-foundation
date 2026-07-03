import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { LoginEventStatusSchema, type LoginEventStatus, type ListLoginActivityQuery } from '@app/shared-types';
import { LOGIN_ACTIVITY } from '../constants';

const MS_PER_DAY = 86_400_000;

@ValidatorConstraint({ name: 'RangeNotOver90Days', async: false })
export class RangeNotOver90Days implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as { from?: string; to?: string };
    if (!obj.from || !obj.to) return true;
    const fromMs = Date.parse(obj.from);
    const toMs = Date.parse(obj.to);
    // Invalid dates are handled by @IsDateString
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return true;
    if (toMs < fromMs) return false;
    const days = (toMs - fromMs) / MS_PER_DAY;
    return days <= LOGIN_ACTIVITY.MAX_RANGE_DAYS;
  }

  defaultMessage(): string {
    return `Range cannot exceed ${LOGIN_ACTIVITY.MAX_RANGE_DAYS} days and "to" must be >= "from"`;
  }
}

const LOGIN_EVENT_STATUSES = LoginEventStatusSchema.options;

export class ListLoginActivityQueryDto implements Omit<ListLoginActivityQuery, 'limit' | 'offset'> {
  @ApiProperty({ example: '2026-05-19', description: 'Range start (ISO date)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-05-26', description: 'Range end (ISO date)' })
  @IsDateString()
  @Validate(RangeNotOver90Days)
  to!: string;

  @ApiProperty({
    required: false,
    enum: LOGIN_EVENT_STATUSES,
    isArray: true,
    description: 'Filter by event status',
  })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value !== undefined ? [value] : undefined))
  @IsArray()
  @IsIn(LOGIN_EVENT_STATUSES, { each: true })
  statuses?: LoginEventStatus[];

  @ApiProperty({ required: false, description: 'Free-text user search (email or name)' })
  @IsOptional()
  @IsString()
  userQuery?: string;

  @ApiProperty({ required: false, description: 'Filter by IP address' })
  @IsOptional()
  @IsString()
  ip?: string;

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

  @ApiProperty({
    required: false,
    default: LOGIN_ACTIVITY.DEFAULT_PAGE_LIMIT,
    description: 'Page size',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LOGIN_ACTIVITY.MAX_PAGE_LIMIT)
  limit?: number = LOGIN_ACTIVITY.DEFAULT_PAGE_LIMIT;

  @ApiProperty({ required: false, default: 0, description: 'Page offset' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
