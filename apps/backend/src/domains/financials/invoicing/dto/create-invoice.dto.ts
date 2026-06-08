import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsEnum, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import type {
  CreateInvoiceLineItemInput,
  CreateInvoiceInput,
  RecordPaymentInput,
  UpdateInvoiceInput,
} from '@sally/shared-types';

export class CreateInvoiceLineItemDto implements CreateInvoiceLineItemInput {
  @ApiProperty({
    example: 'LINEHAUL',
    enum: [
      'LINEHAUL',
      'FUEL_SURCHARGE',
      'DETENTION_PICKUP',
      'DETENTION_DELIVERY',
      'LAYOVER',
      'LUMPER',
      'TONU',
      'ACCESSORIAL',
      'ADJUSTMENT',
    ],
  })
  @IsEnum([
    'LINEHAUL',
    'FUEL_SURCHARGE',
    'DETENTION_PICKUP',
    'DETENTION_DELIVERY',
    'LAYOVER',
    'LUMPER',
    'TONU',
    'ACCESSORIAL',
    'ADJUSTMENT',
  ])
  type:
    | 'LINEHAUL'
    | 'FUEL_SURCHARGE'
    | 'DETENTION_PICKUP'
    | 'DETENTION_DELIVERY'
    | 'LAYOVER'
    | 'LUMPER'
    | 'TONU'
    | 'ACCESSORIAL'
    | 'ADJUSTMENT';

  @ApiProperty({ example: 'Line haul - Chicago to Dallas' })
  @IsString()
  description: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ example: 250000, description: 'Unit price in cents' })
  @IsNumber()
  @Min(0)
  unitPriceCents: number;
}

export class CreateInvoiceDto implements CreateInvoiceInput {
  @ApiProperty({
    example: 'LD-20260213-001',
    description: 'Load ID to generate invoice for',
  })
  @IsString()
  loadId: string;

  @ApiProperty({
    example: 30,
    description: 'Payment terms in days',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentTermsDays?: number;

  @ApiProperty({ example: 'Net 30', required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 'Internal reference', required: false })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiProperty({
    type: [CreateInvoiceLineItemDto],
    required: false,
    description: 'Manual line items (if not auto-generating)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineItemDto)
  lineItems?: CreateInvoiceLineItemDto[];
}

export class RecordPaymentDto implements RecordPaymentInput {
  @ApiProperty({ example: 250000, description: 'Payment amount in cents' })
  @IsNumber()
  @Min(1)
  amountCents: number;

  @ApiProperty({ example: 'check', required: false })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiProperty({ example: 'CHK-12345', required: false })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiProperty({ example: '2026-02-13', description: 'Payment date' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInvoiceDto implements UpdateInvoiceInput {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  paymentTermsDays?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  adjustmentCents?: number;

  @ApiProperty({ type: [CreateInvoiceLineItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineItemDto)
  lineItems?: CreateInvoiceLineItemDto[];
}
