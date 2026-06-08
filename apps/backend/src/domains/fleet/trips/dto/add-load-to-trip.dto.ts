import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import type { AddLoadToTripInput } from '@sally/shared-types';

export class AddLoadToTripDto implements AddLoadToTripInput {
  @ApiProperty({ example: 'LOAD-003', description: 'Load ID to add' })
  @IsString()
  loadId: string;
}
