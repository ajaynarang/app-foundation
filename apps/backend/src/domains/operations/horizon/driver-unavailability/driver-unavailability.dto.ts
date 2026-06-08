import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { DriverUnavailabilityType } from '@prisma/client';

export class CreateDriverUnavailabilityDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  driverId: number;

  @ApiProperty({ enum: DriverUnavailabilityType, example: 'PTO' })
  @IsEnum(DriverUnavailabilityType)
  type: DriverUnavailabilityType;

  @ApiProperty({ example: '2026-04-10', description: 'YYYY-MM-DD' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-04-11', description: 'YYYY-MM-DD, inclusive' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ required: false, example: 'Family vacation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateDriverUnavailabilityDto {
  @ApiProperty({ enum: DriverUnavailabilityType, required: false })
  @IsOptional()
  @IsEnum(DriverUnavailabilityType)
  type?: DriverUnavailabilityType;

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
