import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import type { AssignTripInput } from '@sally/shared-types';

export class AssignTripDto implements AssignTripInput {
  @ApiProperty({ example: 'DRV-001', description: 'Driver string ID' })
  @IsString()
  driverId: string;

  @ApiProperty({ example: 'VH-001', description: 'Vehicle string ID' })
  @IsString()
  vehicleId: string;

  @ApiProperty({
    example: false,
    description: 'Whether to auto-generate a route plan',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  generateRoute?: boolean;
}
