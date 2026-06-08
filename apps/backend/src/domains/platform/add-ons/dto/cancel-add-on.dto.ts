import { IsOptional, IsString } from 'class-validator';

export class CancelAddOnDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
