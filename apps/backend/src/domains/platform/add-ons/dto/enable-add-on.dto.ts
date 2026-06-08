import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EnableAddOnDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  priceCents?: number;
}
