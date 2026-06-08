import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import type { AssignLegInput } from '@sally/shared-types';

export class AssignLegDto implements AssignLegInput {
  @ApiProperty({
    example: 'DRV-001',
    description: 'Driver ID to assign to this leg',
  })
  @IsString()
  @IsNotEmpty()
  driverId: string;

  @ApiProperty({
    required: false,
    example: 'VEH-001',
    description: 'Vehicle ID (defaults to driver assigned vehicle if not provided)',
  })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({
    required: false,
    example: 'TRL-001',
    description: 'Trailer ID (defaults to vehicle current trailer if not provided)',
  })
  @IsOptional()
  @IsString()
  trailerId?: string;
}
