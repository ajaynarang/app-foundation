import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsIn, Min, Max, Validate, ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { Type } from 'class-transformer';
import { TripStatusSchema } from '@sally/shared-types';

// Single source of truth — derive valid statuses from the shared enum schema (§21a),
// never a hand-maintained array.
const VALID_TRIP_STATUSES = TripStatusSchema.options;
const VALID_SORT_FIELDS = ['createdAt', 'assignedAt', 'totalRevenueCents', 'loadCount'];

// Accepts a single status or a comma-separated set ("DRAFT,ASSIGNED,IN_PROGRESS"),
// validating each part against TripStatus.
@ValidatorConstraint({ name: 'isTripStatusList', async: false })
class IsTripStatusList implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const parts = value.toUpperCase().split(',');
    return parts.every((p) => (VALID_TRIP_STATUSES as readonly string[]).includes(p.trim()));
  }
  defaultMessage(): string {
    return `status must be one or more of: ${VALID_TRIP_STATUSES.join(', ')}`;
  }
}

export class TripListQueryDto {
  @ApiProperty({ required: false, enum: VALID_TRIP_STATUSES, description: 'Single status or comma-separated set' })
  @Validate(IsTripStatusList)
  @IsOptional()
  status?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  driverId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  vehicleId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dateFrom?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dateTo?: string;

  @ApiProperty({
    required: false,
    default: 'createdAt',
    enum: VALID_SORT_FIELDS,
  })
  @IsIn(VALID_SORT_FIELDS)
  @IsOptional()
  sortBy?: string;

  @ApiProperty({ required: false, default: 'desc', enum: ['asc', 'desc'] })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder?: string;

  @ApiProperty({ required: false, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiProperty({ required: false, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}
