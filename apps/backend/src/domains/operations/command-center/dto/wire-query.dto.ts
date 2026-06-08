import { IsArray, IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WireKindSchema } from '@sally/shared-types';
import type { WireKind } from '@sally/shared-types';
import { WIRE_BACKFILL_DEFAULT_LIMIT, WIRE_BACKFILL_MAX_LIMIT } from '../tower.constants';

const WIRE_KIND_VALUES = WireKindSchema.options;

/**
 * Tower v3 — query parameters for the wire backfill endpoint.
 * `kinds` arrives as a comma-separated string; defaults to all kinds.
 */
export class WireQueryDto {
  @ApiPropertyOptional({
    description: 'Floor for chronological backfill (ISO 8601). Defaults to NOW - 30min.',
  })
  @IsOptional()
  @IsISO8601()
  since?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated list of kinds to include. Defaults to all kinds.',
    enum: WIRE_KIND_VALUES,
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    return value
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  })
  @IsArray()
  @IsIn(WIRE_KIND_VALUES, { each: true })
  kinds?: WireKind[];

  @ApiPropertyOptional({
    description: 'Max number of wire items to return',
    minimum: 1,
    maximum: WIRE_BACKFILL_MAX_LIMIT,
    default: WIRE_BACKFILL_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WIRE_BACKFILL_MAX_LIMIT)
  limit: number = WIRE_BACKFILL_DEFAULT_LIMIT;
}
