import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsObject } from 'class-validator';
import { IntegrationType, IntegrationVendor } from '@appshore/db';

export { IntegrationType, IntegrationVendor };

export class CreateIntegrationDto {
  @ApiProperty({ enum: IntegrationType })
  @IsEnum(IntegrationType)
  integrationType: IntegrationType;

  @ApiProperty({ enum: IntegrationVendor })
  @IsEnum(IntegrationVendor)
  vendor: IntegrationVendor;

  @ApiProperty()
  @IsString()
  displayName: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;
}
