import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { LoginEventStatusSchema, type LoginEventStatus, type ListLoginActivityQuery } from '@app/shared-types';
import { CursorQueryDto, QueryBool, QueryInt, QuerySearch } from '@appshore/kernel/shared/utils/query-dto';
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

/** `limit` (a whole number, clamped 1…100) and `cursor` come from {@link CursorQueryDto}. */
export class ListLoginActivityQueryDto extends CursorQueryDto implements Omit<ListLoginActivityQuery, 'limit'> {
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

  /** Free-text user search (email or name). */
  @QuerySearch({ name: 'user_query', description: 'Free-text user search (email or name)' })
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

  /** Scope to one tenant (the numeric id; the super-admin route only). */
  @QueryInt({ name: 'tenant_id', min: 1, max: 2_147_483_647, description: 'Scope to a specific tenant' })
  tenantId?: number;

  /** Exclude SUPER_ADMIN users from results (the super-admin route only). `true` / `false`. */
  @QueryBool({ name: 'exclude_super_admin', description: 'Exclude SUPER_ADMIN users (super-admin route only)' })
  excludeSuperAdmin?: boolean;
}
