import { IsString, IsOptional, IsObject, IsBoolean } from 'class-validator';
import type { UpdateIntegrationInput } from '@app/shared-types';

export class UpdateIntegrationDto implements UpdateIntegrationInput {
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
