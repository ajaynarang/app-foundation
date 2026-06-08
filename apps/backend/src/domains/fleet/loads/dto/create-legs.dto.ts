import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMinSize } from 'class-validator';
import type { CreateLoadLegsInput } from '@sally/shared-types';

export class CreateLegsDto implements CreateLoadLegsInput {
  @ApiProperty({
    type: [Number],
    description: 'Stop IDs to use as exchange points between relay legs',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  exchangeStopIds: number[];
}
