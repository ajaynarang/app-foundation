import { IsString, IsNumber, IsInt, IsOptional, IsBoolean, IsIn, Min, Max } from 'class-validator';
import type { CreateLoadChargeInput } from '@sally/shared-types';

const VALID_CHARGE_TYPES = [
  'linehaul',
  'fuel_surcharge',
  'detention_pickup',
  'detention_delivery',
  'layover',
  'lumper',
  'tonu',
  'accessorial',
  'adjustment',
];

export class CreateLoadChargeDto implements CreateLoadChargeInput {
  @IsString()
  @IsIn(VALID_CHARGE_TYPES)
  chargeType: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(9999999)
  unitPriceCents: number;

  @IsOptional()
  @IsBoolean()
  isBillable?: boolean;

  @IsOptional()
  @IsBoolean()
  isPayable?: boolean;
}

export class UpdateLoadChargeDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(999)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(9999999)
  unitPriceCents?: number;

  @IsOptional()
  @IsBoolean()
  isBillable?: boolean;

  @IsOptional()
  @IsBoolean()
  isPayable?: boolean;
}
