import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  IsArray,
  IsBoolean,
  IsObject,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateLoadStopDto } from './create-load-stop.dto';
import type { CreateLoadInput } from '@sally/shared-types';

export class CreateLoadDto implements CreateLoadInput {
  @ApiProperty({
    example: 'LOAD-001',
    description: 'Unique load number (auto-generated if not provided)',
    required: false,
  })
  @IsString()
  @IsOptional()
  loadNumber?: string;

  @ApiProperty({
    example: 40000,
    description: 'Weight of load in pounds',
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(200000)
  weightLbs: number;

  @ApiProperty({
    example: 'Electronics',
    description: 'Type of commodity being transported',
  })
  @IsString()
  @IsNotEmpty()
  commodityType: string;

  @ApiProperty({
    example: 'Temperature controlled, fragile',
    description: 'Special handling requirements',
    required: false,
  })
  @IsString()
  @IsOptional()
  specialRequirements?: string;

  @ApiProperty({
    example: 'Acme Corp',
    description: 'Customer name',
  })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({
    example: 'DRY_VAN',
    required: false,
    description: 'Equipment type enum value',
  })
  @IsString()
  @IsOptional()
  requiredEquipmentType?: string;

  @ApiProperty({
    example: 'PO-12345',
    description: 'Customer reference / PO number',
    required: false,
  })
  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @ApiProperty({
    example: 245000,
    description: 'Rate in cents (e.g. $2450.00 = 245000)',
    required: false,
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(99999999)
  @IsOptional()
  rateCents?: number;

  @ApiProperty({
    example: 26,
    description: 'Number of pieces / pallets',
    required: false,
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(99999)
  @IsOptional()
  pieces?: number;

  @ApiProperty({ example: 'manual', required: false })
  @IsString()
  @IsOptional()
  intakeSource?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  intakeMetadata?: any;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  customerId?: number;

  @ApiProperty({ example: 'DRAFT', required: false })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({
    example: 34,
    description: 'Min temperature (reefer)',
    required: false,
  })
  @IsNumber()
  @Min(-40)
  @Max(80)
  @IsOptional()
  minTempF?: number;

  @ApiProperty({
    example: 38,
    description: 'Max temperature (reefer)',
    required: false,
  })
  @IsNumber()
  @Min(-40)
  @Max(80)
  @IsOptional()
  maxTempF?: number;

  @ApiProperty({ example: '1.1', description: 'Hazmat class', required: false })
  @IsString()
  @IsOptional()
  hazmatClass?: string;

  @ApiProperty({ example: 'UN1203', description: 'UN number', required: false })
  @IsString()
  @IsOptional()
  unNumber?: string;

  @ApiProperty({
    example: true,
    description: 'Placard required',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  placardRequired?: boolean;

  @ApiProperty({
    type: [CreateLoadStopDto],
    description: 'Array of stops for this load',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateLoadStopDto)
  stops: CreateLoadStopDto[];

  @ApiProperty({ required: false, description: 'Custom field values' })
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}
