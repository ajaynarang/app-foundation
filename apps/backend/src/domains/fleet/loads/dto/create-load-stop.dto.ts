import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsInt, IsOptional, Min, Max } from 'class-validator';
import type { CreateLoadStopInput } from '@sally/shared-types';

export class CreateLoadStopDto implements CreateLoadStopInput {
  @ApiProperty({
    example: 'STOP-001',
    description: 'Stop identifier',
  })
  @IsString()
  @IsNotEmpty()
  stopId: string;

  @ApiProperty({
    example: 1,
    description: 'Sequence order of stop in the load',
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  sequenceOrder: number;

  @ApiProperty({
    example: 'pickup',
    description: 'Action type at stop (pickup, delivery)',
  })
  @IsString()
  @IsNotEmpty()
  actionType: string;

  @ApiProperty({
    example: '2026-02-05',
    description: 'Appointment date (YYYY-MM-DD)',
    required: false,
  })
  @IsString()
  @IsOptional()
  appointmentDate?: string;

  @ApiProperty({
    example: '2026-02-05T08:00:00Z',
    description: 'Earliest arrival time',
    required: false,
  })
  @IsString()
  @IsOptional()
  earliestArrival?: string;

  @ApiProperty({
    example: '2026-02-05T17:00:00Z',
    description: 'Latest arrival time',
    required: false,
  })
  @IsString()
  @IsOptional()
  latestArrival?: string;

  @ApiProperty({
    example: 2.5,
    description: 'Estimated dock hours at this stop',
  })
  @IsNumber()
  @Min(0)
  @Max(72)
  estimatedDockHours: number;

  @ApiProperty({
    example: 'Walmart DC #4523',
    description: 'Stop name (for inline creation during manual entry)',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: '123 Main St',
    description: 'Stop address (for inline creation during manual entry)',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    example: 'Dallas',
    description: 'Stop city (for inline creation during manual entry)',
    required: false,
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({
    example: 'TX',
    description: 'Stop state (for inline creation during manual entry)',
    required: false,
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({
    example: '75201',
    description: 'Stop ZIP code (for inline creation during manual entry)',
    required: false,
  })
  @IsString()
  @IsOptional()
  zipCode?: string;
}
