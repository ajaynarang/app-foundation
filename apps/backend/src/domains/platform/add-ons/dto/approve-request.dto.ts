import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ApproveRequestDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  giftedPriceCents?: number;
}
