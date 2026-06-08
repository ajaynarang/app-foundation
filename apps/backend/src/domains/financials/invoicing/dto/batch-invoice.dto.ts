import { IsArray, IsString, IsOptional, IsNumber, Min, IsDateString, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { BatchGenerateInput, BatchInvoiceActionInput, BatchMarkPaidInput } from '@sally/shared-types';

export class BatchGenerateDto implements BatchGenerateInput {
  @ApiProperty({
    example: ['LD-20260213-001', 'LD-20260213-002'],
    description: 'Load IDs to generate invoices for (max 50)',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  loadIds: string[];

  @ApiProperty({ example: 30, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentTermsDays?: number;
}

export class BatchActionDto implements BatchInvoiceActionInput {
  @ApiProperty({
    example: ['INV-2026-0001', 'INV-2026-0002'],
    description: 'Invoice numbers to act on (max 50)',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  invoiceIds: string[];
}

export class BatchMarkPaidDto extends BatchActionDto implements BatchMarkPaidInput {
  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ example: 'check', required: false })
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
