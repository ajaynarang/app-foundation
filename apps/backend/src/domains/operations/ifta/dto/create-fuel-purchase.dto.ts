import { IsString, IsNumber, IsOptional, IsDateString, IsInt, Length, Min, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFuelPurchaseDto {
  @ApiProperty({
    description: 'Purchase date (ISO 8601)',
    example: '2026-03-15',
  })
  @IsDateString()
  purchaseDate: string;

  @ApiProperty({ description: 'US state code (2 letters)', example: 'TX' })
  @IsString()
  @Length(2, 2)
  jurisdiction: string;

  @ApiProperty({ description: 'Gallons purchased', example: 150.5 })
  @IsNumber()
  @Min(0.01)
  gallons: number;

  @ApiProperty({
    description: 'Price per gallon in dollars',
    example: 3.45,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerGallon?: number;

  @ApiProperty({ description: 'Vehicle ID', required: false })
  @IsOptional()
  @IsInt()
  vehicleId?: number;

  @ApiProperty({ description: 'Driver ID', required: false })
  @IsOptional()
  @IsInt()
  driverId?: number;

  @ApiProperty({ description: 'Fuel station name', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  stationName?: string;

  @ApiProperty({
    description: "Vendor name (e.g. Pilot, Love's)",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  vendorName?: string;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({
    description: 'Source of the fuel purchase data',
    enum: ['MANUAL', 'RECEIPT_SCAN'],
    required: false,
    default: 'MANUAL',
  })
  @IsOptional()
  @IsString()
  source?: 'MANUAL' | 'RECEIPT_SCAN';
}
