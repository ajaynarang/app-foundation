import { IsOptional, IsString, IsInt, IsBoolean, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdatePlanConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  tagline?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value === null ? null : Number(value)))
  pricePerUnitCents?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value === null ? null : Number(value)))
  seatLimit?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (value === null ? null : Number(value)))
  userLimit?: number | null;

  @IsOptional()
  @IsBoolean()
  isPopular?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  providerPriceId?: string | null;
}
