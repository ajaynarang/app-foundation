import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import type { UpdateInvoiceSettingsInput } from '@sally/shared-types';

export class UpdateInvoiceSettingsDto implements UpdateInvoiceSettingsInput {
  @IsOptional()
  @IsString()
  companyLegalName?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  mcNumber?: string;

  @IsOptional()
  @IsString()
  dotNumber?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  defaultPaymentTermsDays?: number;

  @IsOptional()
  @IsString()
  remittanceInstructions?: string;

  @IsOptional()
  @IsString()
  acceptedPaymentMethods?: string;

  @IsOptional()
  @IsString()
  defaultNotes?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsString()
  invoicePrefix?: string;

  @IsOptional()
  @IsString()
  replyToEmail?: string;

  @IsOptional()
  @IsString()
  emailSubjectTemplate?: string;

  @IsOptional()
  @IsString()
  emailBodyTemplate?: string;
}
