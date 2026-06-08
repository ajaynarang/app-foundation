import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LOOKAHEAD_DEFAULT_HOURS, LOOKAHEAD_MAX_HOURS, LOOKAHEAD_MIN_HOURS } from '../tower.constants';

/**
 * Tower v3 — query parameters for active-loads and risk-scores endpoints.
 * `lookaheadHours` controls which ASSIGNED loads roll in alongside IN_TRANSIT.
 */
export class ActiveLoadsQueryDto {
  @ApiPropertyOptional({
    description: 'Pull ASSIGNED loads with nextPickupAt within this many hours from now',
    minimum: LOOKAHEAD_MIN_HOURS,
    maximum: LOOKAHEAD_MAX_HOURS,
    default: LOOKAHEAD_DEFAULT_HOURS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(LOOKAHEAD_MIN_HOURS)
  @Max(LOOKAHEAD_MAX_HOURS)
  lookaheadHours: number = LOOKAHEAD_DEFAULT_HOURS;
}
