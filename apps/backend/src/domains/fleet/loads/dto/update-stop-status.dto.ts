import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { LoadStopStatusSchema, type LoadStopStatus } from '@sally/shared-types';

/**
 * Forward-only stop status transitions accepted from clients.
 *
 * `PENDING` is the initial state (set when the stop is created — never sent
 * by clients). Drivers progress ARRIVED → IN_PROGRESS → COMPLETED.
 */
type ForwardStopStatus = Exclude<LoadStopStatus, 'PENDING'>;

const FORWARD_STOP_STATUSES = LoadStopStatusSchema.options.filter((s): s is ForwardStopStatus => s !== 'PENDING');

export class UpdateStopStatusDto {
  @ApiProperty({
    enum: FORWARD_STOP_STATUSES,
    description: 'Target status for the stop (forward transitions only)',
  })
  @IsString()
  @IsIn(FORWARD_STOP_STATUSES)
  status: LoadStopStatus;
}
