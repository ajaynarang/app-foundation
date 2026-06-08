import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { IntegrationType, IntegrationVendor } from '@prisma/client';

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
