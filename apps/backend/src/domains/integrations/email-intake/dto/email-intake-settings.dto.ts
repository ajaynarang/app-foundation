import { IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';

export class UpdateEmailIntakeSettingsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedDomains?: string[];

  @IsOptional()
  @IsBoolean()
  autoApproveCustomerDomains?: boolean;

  @IsOptional()
  @IsString()
  unknownSenderPolicy?: 'HOLD' | 'PARSE_ANYWAY' | 'REJECT';

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
