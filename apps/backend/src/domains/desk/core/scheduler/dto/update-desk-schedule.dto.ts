import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { UpdateDeskScheduleRequest } from '@app/shared-types';

/**
 * PATCH /desk/schedule — flips the tenant-wide master switch for autonomous
 * Desk runs. Off (default) pauses every schedule tenant-wide; manual "Run
 * now" is unaffected.
 */
export class UpdateDeskScheduleDto implements UpdateDeskScheduleRequest {
  @ApiProperty({
    description: 'When true, responsibilities may run on their schedules; false pauses all autonomous runs',
  })
  @IsBoolean()
  enabled: boolean;
}
