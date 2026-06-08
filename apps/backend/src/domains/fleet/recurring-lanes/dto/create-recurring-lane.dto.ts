import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { CreateRecurringLaneInput } from '@sally/shared-types';

export class CreateRecurringLaneStopDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  stopId: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsInt()
  @Min(0)
  sequenceOrder: number;

  @ApiProperty({ example: 'pickup' })
  @IsString()
  @IsIn(['pickup', 'delivery', 'both'])
  actionType: 'pickup' | 'delivery' | 'both';

  @ApiProperty({ required: false, example: '08:00' })
  @IsString()
  @IsOptional()
  earliestArrival?: string;

  @ApiProperty({ required: false, example: '10:00' })
  @IsString()
  @IsOptional()
  latestArrival?: string;

  @ApiProperty({ example: 2.0 })
  @IsNumber()
  @Min(0)
  @Max(72)
  estimatedDockHours: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(30)
  dayOffset: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  facilityNotes?: string;
}

export class CreateRecurringLaneDto implements CreateRecurringLaneInput {
  @ApiProperty({ example: 'Walmart Weekly Dallas-Houston' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  customerId?: number;

  @ApiProperty({ example: 'Walmart' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({
    required: false,
    example: 'DRY_VAN',
    description: 'Equipment type enum value',
  })
  @IsString()
  @IsOptional()
  requiredEquipmentType?: string;

  @ApiProperty({ example: 'General Merchandise' })
  @IsString()
  @IsNotEmpty()
  commodityType: string;

  @ApiProperty({ example: 42000 })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(200000)
  weightLbs: number;

  @ApiProperty({ required: false, example: 250000 })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(99999999)
  @IsOptional()
  rateCents?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(99999)
  @IsOptional()
  pieces?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  specialRequirements?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @ApiProperty({ example: 'weekly' })
  @IsString()
  @IsIn(['daily', 'weekly', 'biweekly', 'monthly', 'custom'])
  scheduleType: string;

  @ApiProperty({ required: false, example: [1, 3, 5] })
  @IsArray()
  @IsOptional()
  scheduleDays?: number[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  scheduleCustomCron?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  autoCreate?: boolean;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  autoAssignDriverId?: number;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  autoAssignVehicleId?: number;

  @ApiProperty({ required: false, example: '2026-03-01' })
  @IsString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsString()
  @IsOptional()
  effectiveUntil?: string;

  @ApiProperty({ type: [CreateRecurringLaneStopDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecurringLaneStopDto)
  stops: CreateRecurringLaneStopDto[];
}
