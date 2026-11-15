import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { TenantPlan } from '@appshore/db';

/** PATCH /plans/tenant/:tenant_id — assign a plan to a tenant (SUPER_ADMIN). */
export class AssignTenantPlanDto {
  @ApiProperty({ enum: TenantPlan })
  @IsEnum(TenantPlan)
  plan!: TenantPlan;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** PATCH /plans/:plan/provider-price — set (or clear, with null) the billing provider's price id. */
export class UpdateProviderPriceDto {
  @ApiProperty({ nullable: true, example: 'price_123' })
  @ValidateIf((dto: UpdateProviderPriceDto) => dto.providerPriceId !== null)
  @IsString()
  @MaxLength(255)
  providerPriceId!: string | null;
}
