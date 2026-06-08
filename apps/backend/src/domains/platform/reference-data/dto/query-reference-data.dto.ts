import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryReferenceDataDto {
  @ApiProperty({
    example: 'equipment_type,vehicle_status',
    description: 'Comma-separated list of categories to retrieve. Omit for all categories.',
    required: false,
  })
  @IsString()
  @IsOptional()
  category?: string;
}
