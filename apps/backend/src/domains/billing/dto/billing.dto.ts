import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsEnum, IsUrl, IsBoolean, Min } from 'class-validator';
import { CursorQueryDto, QueryEnum } from '@appshore/kernel/shared/utils/query-dto';
import { BillingInvoiceStatus, TenantPlan } from '@appshore/db';

export class CreateCheckoutDto {
  @ApiProperty({ enum: TenantPlan })
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  successUrl: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  cancelUrl: string;
}

export class UpgradePlanDto {
  @ApiProperty({ enum: TenantPlan })
  @IsEnum(TenantPlan)
  newPlan: TenantPlan;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  newQuantity?: number;
}

export class DowngradePlanDto {
  @ApiProperty({ enum: TenantPlan })
  @IsEnum(TenantPlan)
  newPlan: TenantPlan;
}

export class UpdateQuantityDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetupPaymentMethodDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  returnUrl: string;
}

export class AddWalletCreditDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty()
  @IsString()
  reason: string;
}

export class IssueRefundDto {
  @ApiProperty()
  @IsString()
  paymentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  creditWallet?: boolean;
}

export class OverrideUnitPriceDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  unitPriceCents: number;
}

export class ExtendTrialDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  days: number;
}

export class ForceSuspendDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class AdminCreateSubscriptionDto {
  @ApiProperty({ enum: TenantPlan })
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  customPriceCents?: number;
}

export class AdminChangePlanDto {
  @ApiProperty({ enum: TenantPlan })
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

/** `GET /billing/invoices` — `status` (one invoice status), `limit` (1…100, default 50) and `cursor`. */
export class PaginationQueryDto extends CursorQueryDto {
  @QueryEnum(Object.values(BillingInvoiceStatus))
  status?: BillingInvoiceStatus;
}
