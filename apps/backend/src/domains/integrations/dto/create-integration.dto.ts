import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import type { CreateIntegrationInput } from '@sally/shared-types';

export enum IntegrationType {
  TMS = 'TMS',
  ELD = 'ELD',
  ACCOUNTING = 'ACCOUNTING',
  LOAD_BOARD = 'LOAD_BOARD',
}

export enum IntegrationVendor {
  MCLEOD_TMS = 'MCLEOD_TMS',
  TMW_TMS = 'TMW_TMS',
  PROJECT44_TMS = 'PROJECT44_TMS',
  SAMSARA_ELD = 'SAMSARA_ELD',
  MOTIVE_ELD = 'MOTIVE_ELD',
  QUICKBOOKS = 'QUICKBOOKS',
  DAT_LOAD_BOARD = 'DAT_LOAD_BOARD',
}

export class CreateIntegrationDto implements CreateIntegrationInput {
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
