import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
  IsObject,
  Min,
  Max,
  IsDateString,
} from 'class-validator';

export class GenerateRouteDto {
  @ApiProperty({
    example: 'DR-ABC123',
    description: 'Driver ID to generate route for',
  })
  @IsString()
  @IsNotEmpty()
  driverId: string;

  @ApiProperty({
    example: 'VH-XYZ456',
    description: 'Vehicle ID to use for the route',
  })
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({
    example: '2026-03-29T08:00:00Z',
    description: 'Planned departure time in ISO 8601 format',
  })
  @IsDateString()
  @IsNotEmpty()
  departureTime: string;

  @ApiProperty({
    enum: ['minimize_time', 'minimize_cost', 'balance'],
    description: 'Route optimization strategy',
  })
  @IsString()
  @IsIn(['minimize_time', 'minimize_cost', 'balance'])
  optimizationPriority: 'minimize_time' | 'minimize_cost' | 'balance';

  @ApiPropertyOptional({
    enum: ['auto', 'full', 'split_8_2', 'split_7_3'],
    description: 'Driver rest preference (HOS split type)',
  })
  @IsString()
  @IsIn(['auto', 'full', 'split_8_2', 'split_7_3'])
  @IsOptional()
  restPreference?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Avoid toll roads when planning the route',
  })
  @IsBoolean()
  @IsOptional()
  avoidTolls?: boolean;

  @ApiPropertyOptional({
    example: 5,
    description: 'Maximum detour miles allowed to reach a fuel stop',
  })
  @IsNumber()
  @Min(0)
  @Max(50)
  @IsOptional()
  maxFuelDetourMiles?: number;

  @ApiPropertyOptional({
    description: 'Per-leg driver/vehicle mapping for relay loads. Key is legId, value has driverId and vehicleId.',
    example: { 'LEG-LD-001-1': { driverId: 'DR-ABC', vehicleId: 'VH-123' } },
  })
  @IsObject()
  @IsOptional()
  legDriverMap?: Record<string, { driverId: string; vehicleId: string }>;
}
