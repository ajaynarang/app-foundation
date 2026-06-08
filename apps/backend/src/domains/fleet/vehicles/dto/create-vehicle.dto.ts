import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsObject,
  Length,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { CreateVehicleInput } from '@sally/shared-types';

export class CreateVehicleDto implements CreateVehicleInput {
  @ApiProperty({ example: 'TRUCK-101', description: 'Vehicle unit number' })
  @IsString()
  @IsNotEmpty()
  unitNumber: string;

  @ApiProperty({
    example: '1FUJGBDV7CLBP8834',
    description: 'Vehicle identification number (17 characters)',
  })
  @IsString()
  @IsNotEmpty()
  @Length(17, 17, { message: 'VIN must be exactly 17 characters' })
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i, {
    message: 'VIN must contain only valid characters (no I, O, Q)',
  })
  @Transform(({ value }) => value?.toUpperCase().replace(/\s/g, ''))
  vin: string;

  @ApiProperty({
    example: 'DRY_VAN',
    description: 'Equipment type',
    enum: ['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'POWER_ONLY', 'OTHER'],
  })
  @IsEnum(['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'POWER_ONLY', 'OTHER'], { message: 'Invalid equipment type' })
  @IsNotEmpty()
  equipmentType: 'DRY_VAN' | 'FLATBED' | 'REEFER' | 'STEP_DECK' | 'POWER_ONLY' | 'OTHER';

  @ApiPropertyOptional({
    example: 'OWNED',
    description: 'Vehicle ownership type',
    enum: ['OWNED', 'LEASED', 'OWNER_OPERATOR'],
  })
  @IsEnum(['OWNED', 'LEASED', 'OWNER_OPERATOR'], {
    message: 'Invalid ownership type. Use OWNED, LEASED, or OWNER_OPERATOR.',
  })
  @IsOptional()
  ownershipType?: 'OWNED' | 'LEASED' | 'OWNER_OPERATOR';

  @ApiProperty({ example: 150, description: 'Fuel tank capacity in gallons' })
  @IsNumber()
  @Min(1)
  @Max(500)
  fuelCapacityGallons: number;

  @ApiProperty({
    example: 6.5,
    description: 'Miles per gallon efficiency',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  mpg?: number;

  @ApiProperty({
    example: 'AVAILABLE',
    description: 'Vehicle operational status',
    enum: ['AVAILABLE', 'IN_SHOP', 'OUT_OF_SERVICE'],
    required: false,
  })
  @IsEnum(['AVAILABLE', 'IN_SHOP', 'OUT_OF_SERVICE'], {
    message: 'Invalid status for creation. Use AVAILABLE, IN_SHOP, or OUT_OF_SERVICE.',
  })
  @IsOptional()
  status?: 'AVAILABLE' | 'IN_SHOP' | 'OUT_OF_SERVICE';

  @ApiProperty({
    example: 'Freightliner',
    description: 'Vehicle make',
    required: false,
  })
  @IsString()
  @IsOptional()
  make?: string;

  @ApiProperty({
    example: 'Cascadia',
    description: 'Vehicle model',
    required: false,
  })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiProperty({ example: 2024, description: 'Vehicle year', required: false })
  @IsNumber()
  @IsInt()
  @Min(1990)
  @Max(new Date().getFullYear() + 2)
  @IsOptional()
  year?: number;

  @ApiProperty({
    example: 'ABC-1234',
    description: 'License plate number',
    required: false,
  })
  @IsString()
  @IsOptional()
  licensePlate?: string;

  @ApiProperty({
    example: 'TX',
    description: 'License plate state (2-letter code)',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Length(2, 2, { message: 'State must be a 2-letter code' })
  @Transform(({ value }) => value?.toUpperCase())
  licensePlateState?: string;

  @ApiProperty({
    example: true,
    description: 'Whether vehicle has sleeper berth',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  hasSleeperBerth?: boolean;

  @ApiProperty({
    example: 80000,
    description: 'Gross vehicle weight in pounds',
    required: false,
  })
  @IsNumber()
  @IsInt()
  @Min(0)
  @Max(200000)
  @IsOptional()
  grossWeightLbs?: number;

  @ApiProperty({
    example: 100,
    description: 'Current fuel level in gallons',
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(500)
  @IsOptional()
  currentFuelGallons?: number;

  @ApiPropertyOptional({ description: 'Internal notes about this vehicle' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({
    example: 1,
    description: 'Primary driver DB ID',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  assignedDriverId?: number | null;

  @ApiProperty({
    example: '2027-03-31',
    description: 'Vehicle registration expiration date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;

  @ApiProperty({
    example: '2027-01-15',
    description: 'Vehicle insurance expiration date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @ApiProperty({
    example: '2026-06-20',
    description: 'Last annual DOT inspection date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  annualInspectionDate?: string;

  @ApiProperty({
    example: '2026-04-15',
    description: 'Next scheduled preventive maintenance date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  nextMaintenanceDate?: string;

  @ApiProperty({ required: false, description: 'Custom field values' })
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}
