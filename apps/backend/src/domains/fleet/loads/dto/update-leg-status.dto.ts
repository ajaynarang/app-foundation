import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { LoadLegStatusSchema, type LoadLegStatus, type UpdateLegStatusInput } from '@sally/shared-types';

const LEG_STATUSES = LoadLegStatusSchema.options;

export class UpdateLegStatusDto implements UpdateLegStatusInput {
  @ApiProperty({
    enum: LEG_STATUSES,
    description: 'Target status for the leg',
  })
  @IsString()
  @IsIn(LEG_STATUSES)
  status: LoadLegStatus;
}
