import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import type { CalculateSettlementInput, AddDeductionInput } from '@sally/shared-types';

export class CalculateSettlementDto implements CalculateSettlementInput {
  @ApiProperty({ example: 'DRV-001', description: 'Driver ID' })
  @IsString()
  driverId: string;

  @ApiProperty({ example: '2026-02-01', description: 'Period start date' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2026-02-07', description: 'Period end date' })
  @IsDateString()
  periodEnd: string;

  @ApiProperty({
    example: false,
    required: false,
    description: 'If true, return preview without creating',
  })
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}

export class AddDeductionDto implements AddDeductionInput {
  @ApiProperty({
    example: 'FUEL_ADVANCE',
    enum: ['FUEL_ADVANCE', 'CASH_ADVANCE', 'INSURANCE', 'EQUIPMENT_LEASE', 'ESCROW', 'OTHER'],
  })
  @IsEnum(['FUEL_ADVANCE', 'CASH_ADVANCE', 'INSURANCE', 'EQUIPMENT_LEASE', 'ESCROW', 'OTHER'])
  type: 'OTHER' | 'FUEL_ADVANCE' | 'CASH_ADVANCE' | 'INSURANCE' | 'EQUIPMENT_LEASE' | 'ESCROW';

  @ApiProperty({ example: 'Fuel advance - 02/10' })
  @IsString()
  description: string;

  @ApiProperty({ example: 50000, description: 'Deduction amount in cents' })
  @IsNumber()
  @Min(1)
  amountCents: number;
}
