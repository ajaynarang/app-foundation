import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional, Length, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { UpsertLaneRateTargetInput } from '@sally/shared-types';

export class UpsertLaneRateTargetDto implements UpsertLaneRateTargetInput {
  @ApiProperty({ example: 'TX', description: 'Origin state (2-letter code)' })
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => value?.toUpperCase())
  originState: string;

  @ApiProperty({
    example: 'IL',
    description: 'Destination state (2-letter code)',
  })
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => value?.toUpperCase())
  destinationState: string;

  @ApiProperty({
    example: 300,
    description: 'Target rate in cents per mile (e.g. 300 = $3.00/mi)',
  })
  @IsInt()
  @Min(1)
  @Max(9999999)
  targetRateCentsPerMile: number;

  @ApiPropertyOptional({
    example: 'Never go below this on reefer loads',
    description: 'Optional notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim() || undefined)
  notes?: string;

  @ApiPropertyOptional({
    example: 'dry_van',
    description: 'Equipment type filter (null = all equipment)',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim() || undefined)
  equipmentType?: string;
}
