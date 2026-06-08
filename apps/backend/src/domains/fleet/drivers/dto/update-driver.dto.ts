import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsDateString,
  IsNumber,
  IsObject,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';
import type { UpdateDriverInput } from '@sally/shared-types';

export class UpdateDriverDto implements UpdateDriverInput {
  @ApiProperty({ example: 'John Smith', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '555-123-4567', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'john@example.com', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'A', enum: ['A', 'B', 'C'], required: false })
  @IsEnum(['A', 'B', 'C'], { message: 'cdlClass must be A, B, or C' })
  @IsOptional()
  cdlClass?: 'A' | 'B' | 'C';

  @ApiProperty({ example: 'DL12345678', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @ApiProperty({ example: 'TX', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsOptional()
  @IsString()
  @Length(2, 2)
  licenseState?: string;

  @ApiProperty({ example: ['HAZMAT', 'TANKER'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  endorsements?: string[];

  @ApiProperty({ example: '2024-03-01', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiProperty({ example: '2026-08-15', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsOptional()
  @IsDateString()
  medicalCardExpiry?: string;

  @ApiProperty({ example: 'Dallas', required: false })
  @IsOptional()
  @IsString()
  homeTerminalCity?: string;

  @ApiProperty({ example: 'TX', required: false })
  @Transform(({ value }) => value?.trim() || undefined)
  @IsOptional()
  @IsString()
  @Length(2, 2)
  homeTerminalState?: string;

  @ApiProperty({ example: 'Jane Smith', required: false })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiProperty({ example: '555-987-6543', required: false })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiProperty({ example: 'Prefers I-40 corridor', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: 1,
    description: 'Primary vehicle DB ID',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  assignedVehicleId?: number | null;

  @ApiProperty({
    example: '2027-06-15',
    description: 'CDL expiration date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  cdlExpiry?: string;

  @ApiProperty({
    example: '2026-01-10',
    description: 'Last Motor Vehicle Record (MVR) pull date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  mvrDate?: string;

  @ApiProperty({
    example: '2025-11-20',
    description: 'Last drug/alcohol test date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  drugTestDate?: string;

  @ApiProperty({
    example: '2026-02-01',
    description: 'Last annual DQ file review date',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  annualReviewDate?: string;

  @ApiProperty({ required: false, description: 'Custom field values' })
  @IsOptional()
  @IsObject()
  customFieldValues?: Record<string, unknown>;
}
