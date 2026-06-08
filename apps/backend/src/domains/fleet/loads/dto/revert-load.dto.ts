import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, MinLength, MaxLength } from 'class-validator';

export const REVERSAL_CATEGORIES = [
  'wrong_load',
  'driver_error',
  'customer_reinstatement',
  'dispatcher_correction',
  'system_error',
  'shipper_change',
  'other',
] as const;

export type ReversalCategory = (typeof REVERSAL_CATEGORIES)[number];

export class RevertLoadDto {
  @ApiProperty({
    description: 'Target status to revert the load to',
    enum: ['PENDING', 'ASSIGNED', 'IN_TRANSIT'],
    example: 'IN_TRANSIT',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['PENDING', 'ASSIGNED', 'IN_TRANSIT'])
  targetStatus: string;

  @ApiProperty({
    description: 'Category of the reversal reason',
    enum: REVERSAL_CATEGORIES,
    example: 'dispatcher_correction',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(REVERSAL_CATEGORIES)
  category: string;

  @ApiProperty({
    description: 'Detailed reason for the reversal',
    minLength: 5,
    maxLength: 2000,
    example: 'Driver reported wrong load was picked up at origin facility',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(2000)
  reason: string;
}
