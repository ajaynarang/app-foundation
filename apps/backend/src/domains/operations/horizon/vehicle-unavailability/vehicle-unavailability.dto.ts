import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { VehicleUnavailabilityType } from '@prisma/client';

export class CreateVehicleUnavailabilityDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  vehicleId: number;

  @ApiProperty({ enum: VehicleUnavailabilityType, example: 'MAINTENANCE' })
  @IsEnum(VehicleUnavailabilityType)
  type: VehicleUnavailabilityType;

  @ApiProperty({ example: '2026-04-10', description: 'YYYY-MM-DD' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-04-11', description: 'YYYY-MM-DD, inclusive' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ required: false, example: 'Scheduled oil change' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateVehicleUnavailabilityDto {
  @ApiProperty({ enum: VehicleUnavailabilityType, required: false })
  @IsOptional()
  @IsEnum(VehicleUnavailabilityType)
  type?: VehicleUnavailabilityType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
