import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsNotEmpty, IsOptional, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import type { AssignAllLegsInput } from '@sally/shared-types';

class LegAssignmentDto {
  @ApiProperty({ example: 'LEG-LD-001-1', description: 'Leg ID to assign' })
  @IsString()
  @IsNotEmpty()
  legId: string;

  @ApiProperty({ example: 'DRV-001', description: 'Driver ID to assign' })
  @IsString()
  @IsNotEmpty()
  driverId: string;

  @ApiProperty({
    required: false,
    example: 'VEH-001',
    description: 'Vehicle ID (optional)',
  })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiProperty({
    required: false,
    example: 'TRL-001',
    description: 'Trailer ID (optional, defaults to vehicle current trailer)',
  })
  @IsOptional()
  @IsString()
  trailerId?: string;
}

export class AssignAllLegsDto implements AssignAllLegsInput {
  @ApiProperty({
    type: [LegAssignmentDto],
    description: 'Array of leg assignments',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LegAssignmentDto)
  assignments: LegAssignmentDto[];
}
