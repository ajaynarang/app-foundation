import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { UpdateRecurringLaneInput } from '@sally/shared-types';
import { CreateRecurringLaneStopDto } from './create-recurring-lane.dto';

export class UpdateRecurringLaneDto implements UpdateRecurringLaneInput {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  customerId?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiProperty({ required: false, description: 'Equipment type enum value' })
  @IsString()
  @IsOptional()
  requiredEquipmentType?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  commodityType?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(200000)
  @IsOptional()
  weightLbs?: number;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false })
  @IsString()
  @IsIn(['daily', 'weekly', 'biweekly', 'monthly', 'custom'])
  @IsOptional()
  scheduleType?: string;

  @ApiProperty({ required: false })
  @IsArray()
  @IsOptional()
  scheduleDays?: number[];

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  scheduleCustomCron?: string;

  @ApiProperty({ required: false })
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

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  effectiveFrom?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  effectiveUntil?: string;

  @ApiProperty({ required: false, type: [CreateRecurringLaneStopDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecurringLaneStopDto)
  @IsOptional()
  stops?: CreateRecurringLaneStopDto[];
}
