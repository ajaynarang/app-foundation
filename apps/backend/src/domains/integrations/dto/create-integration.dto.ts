import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { IntegrationType, IntegrationVendor } from '@appshore/db';

export { IntegrationType, IntegrationVendor };

export class CreateIntegrationDto {
  @IsEnum(IntegrationType)
  integrationType: IntegrationType;

  @IsEnum(IntegrationVendor)
  vendor: IntegrationVendor;

  @IsString()
  displayName: string;

  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;
}
