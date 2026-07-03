import { IsString, IsOptional, IsInt, IsEnum, IsUrl, IsBoolean, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantPlan } from '@appshore/db';

export class CreateCheckoutDto {
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsUrl({ require_tld: false })
  successUrl: string;

  @IsUrl({ require_tld: false })
  cancelUrl: string;
}

export class UpgradePlanDto {
  @IsEnum(TenantPlan)
  newPlan: TenantPlan;

  @IsOptional()
  @IsInt()
  @Min(1)
  newQuantity?: number;
}

export class DowngradePlanDto {
  @IsEnum(TenantPlan)
  newPlan: TenantPlan;
}

export class UpdateQuantityDto {
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CancelSubscriptionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetupPaymentMethodDto {
  @IsUrl({ require_tld: false })
  returnUrl: string;
}

export class AddWalletCreditDto {
  @IsInt()
  @Min(1)
  amountCents: number;

  @IsString()
  reason: string;
}

export class IssueRefundDto {
  @IsString()
  paymentId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  creditWallet?: boolean;
}

export class OverrideUnitPriceDto {
  @IsInt()
  @Min(0)
  unitPriceCents: number;
}

export class ExtendTrialDto {
  @IsInt()
  @Min(1)
  days: number;
}

export class ForceSuspendDto {
  @IsString()
  reason: string;
}

export class AdminCreateSubscriptionDto {
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  customPriceCents?: number;
}

export class AdminChangePlanDto {
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
