import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsBoolean, Min } from 'class-validator';
import { CursorQueryDto, QueryEnum } from '@appshore/kernel/shared/utils/query-dto';
import { WalletTransactionType } from '@appshore/db';

export class TopUpWalletDto {
  @ApiProperty()
  @IsInt()
  @Min(100) // minimum $1.00
  amountCents: number;
}

export class UpdateAutoReloadDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(100)
  thresholdCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(100)
  reloadAmountCents?: number;
}

/** `GET /billing/wallet/transactions` — `limit`, `cursor`, `type` (one transaction type). */
export class WalletTransactionsQueryDto extends CursorQueryDto {
  @QueryEnum(Object.values(WalletTransactionType))
  type?: WalletTransactionType;
}
