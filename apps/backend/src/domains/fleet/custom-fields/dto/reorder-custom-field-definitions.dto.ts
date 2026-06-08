import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import type { ReorderCustomFieldDefinitionsInput } from '@sally/shared-types';

export class ReorderCustomFieldDefinitionsDto implements ReorderCustomFieldDefinitionsInput {
  @ApiProperty({ example: [3, 1, 2], description: 'Custom field definition ids in the desired order' })
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  orderedIds: number[];
}
