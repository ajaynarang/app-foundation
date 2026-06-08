import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { FactoringTxnTypeSchema, type FactoringTxnType } from '@sally/shared-types';

const TXN_TYPES = FactoringTxnTypeSchema.options;

/**
 * Record a factoring transaction (advance / fee / reserve release / chargeback /
 * chargeback reversal) against an invoice. The discriminator `type` selects which
 * service method runs; all other fields are common across types except
 * `autoRecordFee` which only applies to ADVANCE.
 *
 * Status casing rule: `type` values are UPPER_SNAKE; lowercase is rejected by the
 * ValidationPipe before the service is reached.
 */
export class RecordFactoringTransactionDto {
  @ApiProperty({ enum: TXN_TYPES, description: 'Transaction type' })
  @IsString()
  @IsIn(TXN_TYPES)
  type: FactoringTxnType;

  @ApiProperty({ example: 190000, description: 'Amount in cents (positive integer)' })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({ example: '2026-04-21', description: 'Calendar date YYYY-MM-DD (never timezone-converted)' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'transactionDate must be YYYY-MM-DD' })
  transactionDate: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Factor wire/check reference' })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  referenceNumber?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  notes?: string;

  /**
   * Only meaningful when `type=ADVANCE`. When true (default), the service also
   * creates the matching FEE transaction from FactoringCompany.feeRatePct.
   * Ignored for other transaction types.
   */
  @ApiPropertyOptional({ default: true, description: 'ADVANCE only: also auto-record FEE from rate-card' })
  @IsOptional()
  @IsBoolean()
  autoRecordFee?: boolean;
}
