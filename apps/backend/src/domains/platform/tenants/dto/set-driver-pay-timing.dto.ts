import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { DriverPayTimingSchema, type SetDriverPayTimingInput } from '@sally/shared-types';

const TIMINGS = DriverPayTimingSchema.options;

/**
 * Body for `PATCH /api/v1/tenants/me/driver-pay-timing` (Phase 4 — endpoint
 * lands in 4C; DTO ships in 4A so service-layer wiring is consistent).
 *
 * ON_DELIVERY: settlements trigger on load delivery (cash flow risk on carrier).
 * ON_FACTOR_FUND: settlements gate on Invoice.advanceReceivedAt (24-48hr delay).
 */
export class SetDriverPayTimingDto implements SetDriverPayTimingInput {
  @ApiProperty({ enum: TIMINGS, description: 'When drivers get paid relative to factor funding' })
  @IsString()
  @IsIn(TIMINGS)
  timing: (typeof TIMINGS)[number];
}
