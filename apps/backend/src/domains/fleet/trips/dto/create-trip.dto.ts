import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, IsBoolean, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import type { CreateTripInput } from '@sally/shared-types';

export class CreateTripDto implements CreateTripInput {
  @ApiProperty({
    example: ['LOAD-001', 'LOAD-002'],
    description: 'Array of load IDs to group into this trip (2-10)',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  loadIds: string[];

  @ApiProperty({
    example: 'DRV-001',
    description: 'Driver string ID to assign (optional — creates draft if omitted)',
    required: false,
  })
  @IsString()
  @IsOptional()
  driverId?: string;

  @ApiProperty({
    example: 'VH-001',
    description: 'Vehicle string ID to assign (required if driverId provided)',
    required: false,
  })
  @IsString()
  @IsOptional()
  vehicleId?: string;

  @ApiProperty({
    example: false,
    description: 'Whether to auto-generate a route plan after creation',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  generateRoute?: boolean;
}
