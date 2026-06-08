import { IsOptional, IsString, IsInt, IsBoolean, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAddOnDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value === null ? null : Number(value)))
  priceCents?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  providerPriceId?: string | null;
}
