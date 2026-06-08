import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, ValidateNested, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class LoadOrderItemDto {
  @ApiProperty({ example: 'LOAD-001' })
  @IsString()
  loadId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  tripOrder: number;
}

export class UpdateTripDto {
  @ApiProperty({
    description: 'Reorder loads within the trip',
    required: false,
    type: [LoadOrderItemDto],
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LoadOrderItemDto)
  loadOrder?: LoadOrderItemDto[];
}
