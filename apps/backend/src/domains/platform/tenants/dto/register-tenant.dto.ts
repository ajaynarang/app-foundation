import { IsString, IsEmail, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class RegisterTenantDto {
  // Company information
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomain must contain only lowercase letters, numbers, and hyphens',
  })
  subdomain: string;

  // Admin user information
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  firebaseUid: string;

  // Contact information
  @IsString()
  @IsNotEmpty()
  phone: string;

  // Bot protection
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
