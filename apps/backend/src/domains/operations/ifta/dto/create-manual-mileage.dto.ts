import { IsString, IsNumber, IsOptional, IsInt, Length, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateManualMileageDto {
  @ApiProperty({ description: 'US state code (2 letters)', example: 'TX' })
  @IsString()
  @Length(2, 2)
  jurisdiction: string;

  @ApiProperty({ description: 'Total miles in this state', example: 1250.5 })
  @IsNumber()
  @Min(0)
  totalMiles: number;

  @ApiProperty({ description: 'Year', example: 2026 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @ApiProperty({ description: 'Quarter (1-4)', example: 1 })
  @IsInt()
  @Min(1)
  @Max(4)
  quarter: number;

  @ApiProperty({ description: 'Vehicle ID (optional)', required: false })
  @IsOptional()
  @IsInt()
  vehicleId?: number;
}
