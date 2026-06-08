import { IsOptional, IsInt, IsIn, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class QueryQuartersDto {
  @ApiProperty({
    description: 'Filter by year',
    required: false,
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @ApiProperty({
    description: 'Filter by status',
    required: false,
    enum: ['OPEN', 'CALCULATING', 'DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED'],
  })
  @IsOptional()
  @IsIn(['OPEN', 'CALCULATING', 'DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED'])
  status?: string;
}
