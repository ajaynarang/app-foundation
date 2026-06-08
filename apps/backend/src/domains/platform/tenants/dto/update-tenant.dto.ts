import { IsString, IsEmail, IsOptional, Matches, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  companyName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomain must contain only lowercase letters, numbers, and hyphens',
  })
  subdomain?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerFirstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerLastName?: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;
}
