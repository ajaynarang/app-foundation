import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsBoolean,
  IsObject,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLoadStopDto } from './create-load-stop.dto';
import type { UpdateDraftLoadInput } from '@sally/shared-types';

export class UpdateDraftLoadDto implements UpdateDraftLoadInput {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  customerId?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

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
  @Max(200000)
  @IsOptional()
  weightLbs?: number;

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
  @Max(99999)
  @IsOptional()
  pieces?: number;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  specialRequirements?: string;

  @ApiProperty({
    required: false,
    description: 'Enable relay mode for multi-driver FTL loads',
  })
  @IsBoolean()
  @IsOptional()
  isRelay?: boolean;

  @ApiProperty({ type: [CreateLoadStopDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLoadStopDto)
  @IsOptional()
  stops?: CreateLoadStopDto[];

  @ApiProperty({ required: false, description: 'Custom field values' })
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}
