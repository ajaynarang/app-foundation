import { IsString, IsOptional, IsBoolean } from 'class-validator';
import type { SubmitToFactorInput } from '@sally/shared-types';

export class SubmitToFactorDto implements SubmitToFactorInput {
  @IsString()
  factoringCompanyId: string;

  @IsOptional()
  @IsString()
  factoringReference?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
