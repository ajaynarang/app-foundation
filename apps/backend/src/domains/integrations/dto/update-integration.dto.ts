import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';

export class UpdateIntegrationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsObject()
  @IsOptional()
  credentials?: Record<string, any>;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;
}
