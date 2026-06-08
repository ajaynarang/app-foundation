import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  IsEnum,
  IsDateString,
  Length,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTrailerDto {
  @ApiProperty({ example: 'TRL-101', description: 'Trailer unit number' })
  @IsString()
  @IsNotEmpty()
  unitNumber: string;

  @ApiProperty({
    example: 'DRY_VAN',
    description: 'Equipment type (POWER_ONLY not allowed for trailers)',
    enum: ['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'OTHER'],
  })
  @IsEnum(['DRY_VAN', 'FLATBED', 'REEFER', 'STEP_DECK', 'OTHER'], {
    message:
      'Invalid equipment type for trailer. POWER_ONLY is not allowed — use DRY_VAN, FLATBED, REEFER, STEP_DECK, or OTHER.',
  })
  @IsNotEmpty()
  equipmentType: 'DRY_VAN' | 'FLATBED' | 'REEFER' | 'STEP_DECK' | 'OTHER';

  @ApiPropertyOptional({
    example: '1UJAJ0625WL000001',
    description: 'Trailer VIN (17 characters)',
  })
  @IsOptional()
  @IsString()
  @Length(17, 17, { message: 'VIN must be exactly 17 characters' })
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i, {
    message: 'VIN must contain only valid characters (no I, O, Q)',
  })
  @Transform(({ value }) => value?.toUpperCase().replace(/\s/g, ''))
  vin?: string;

  @ApiPropertyOptional({
    example: 'ABC-1234',
    description: 'License plate number',
  })
  @IsOptional()
  @IsString()
  licensePlate?: string;

  @ApiPropertyOptional({
    example: 'TX',
    description: 'License plate state (2-letter code)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: 'State must be a 2-letter code' })
  @Transform(({ value }) => value?.toUpperCase())
  licensePlateState?: string;

  @ApiPropertyOptional({ example: 'Wabash', description: 'Trailer make' })
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional({
    example: 'DuraPlate',
    description: 'Trailer model',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 2022, description: 'Trailer year' })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    example: 53,
    description: 'Trailer length in feet (20-60)',
  })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(20)
  @Max(60)
  lengthFeet?: number;

  @ApiPropertyOptional({
    example: 45000,
    description: 'Maximum payload capacity in pounds',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPayloadLbs?: number;

  @ApiPropertyOptional({
    example: 'OWNED',
    description: 'Ownership type',
    enum: ['OWNED', 'LEASED', 'OWNER_OPERATOR'],
  })
  @IsOptional()
  @IsEnum(['OWNED', 'LEASED', 'OWNER_OPERATOR'], {
    message: 'Invalid ownership type. Use OWNED, LEASED, or OWNER_OPERATOR.',
  })
  ownershipType?: 'OWNED' | 'LEASED' | 'OWNER_OPERATOR';

  @ApiPropertyOptional({
    example: 'Carrier',
    description: 'Reefer unit make (reefer trailers only)',
  })
  @IsOptional()
  @IsString()
  reeferMake?: string;

  @ApiPropertyOptional({
    example: 'X4 7500',
    description: 'Reefer unit model (reefer trailers only)',
  })
  @IsOptional()
  @IsString()
  reeferModel?: string;

  @ApiPropertyOptional({
    example: 'RF12345678',
    description: 'Reefer unit serial number (reefer trailers only)',
  })
  @IsOptional()
  @IsString()
  reeferSerial?: string;

  @ApiPropertyOptional({
    example: '2027-03-31',
    description: 'Registration expiration date',
  })
  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;

  @ApiPropertyOptional({
    example: '2027-01-15',
    description: 'Insurance expiration date',
  })
  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @ApiPropertyOptional({
    example: '2026-06-20',
    description: 'Last annual DOT inspection date',
  })
  @IsOptional()
  @IsDateString()
  annualInspectionDate?: string;

  @ApiPropertyOptional({
    example: '2026-04-15',
    description: 'Next scheduled maintenance date',
  })
  @IsOptional()
  @IsDateString()
  nextMaintenanceDate?: string;

  @ApiPropertyOptional({
    description: 'Internal notes about this trailer',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Assigned vehicle database ID',
  })
  @IsOptional()
  @IsNumber()
  assignedVehicleId?: number;
}
