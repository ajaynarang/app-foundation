import { IsInt, IsOptional, IsBoolean, IsString, IsEnum, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { WalletTransactionType } from '@prisma/client';

export class TopUpWalletDto {
  @IsInt()
  @Min(100) // minimum $1.00
  amountCents: number;
}

export class UpdateAutoReloadDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(100)
  thresholdCents?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  reloadAmountCents?: number;
}

export class WalletTransactionsQueryDto {
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
