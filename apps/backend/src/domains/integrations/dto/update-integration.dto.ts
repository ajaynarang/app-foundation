import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class UpdateIntegrationDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}
