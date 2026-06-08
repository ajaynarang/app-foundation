import { IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class UpdateFuelCardTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
