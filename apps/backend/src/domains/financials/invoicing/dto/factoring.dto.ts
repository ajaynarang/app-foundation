import { IsString, IsOptional, IsIn, IsNumber, IsEnum, Min, Max, MaxLength } from 'class-validator';
import { FactoringCompanyStatus } from '@prisma/client';
import type { CreateFactoringCompanyInput, UpdateFactoringCompanyInput } from '@sally/shared-types';

export class CreateFactoringCompanyDto implements CreateFactoringCompanyInput {
  @IsString()
  companyName: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  remittanceAddress?: string;

  @IsOptional()
  @IsString()
  submissionEmail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  advanceRatePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  feeRatePct?: number;

  @IsOptional()
  @IsString()
  @IsIn(['RECOURSE', 'NON_RECOURSE'])
  recourseType?: 'RECOURSE' | 'NON_RECOURSE';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  remittanceCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  remittanceState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  remittanceZip?: string;

  @IsOptional()
  @IsEnum(FactoringCompanyStatus)
  status?: FactoringCompanyStatus;
}

export class UpdateFactoringCompanyDto implements UpdateFactoringCompanyInput {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  remittanceAddress?: string;

  @IsOptional()
  @IsString()
  submissionEmail?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  advanceRatePct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  feeRatePct?: number;

  @IsOptional()
  @IsString()
  @IsIn(['RECOURSE', 'NON_RECOURSE'])
  recourseType?: 'RECOURSE' | 'NON_RECOURSE';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  remittanceCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  remittanceState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  remittanceZip?: string;

  @IsOptional()
  @IsEnum(FactoringCompanyStatus)
  status?: FactoringCompanyStatus;
}
