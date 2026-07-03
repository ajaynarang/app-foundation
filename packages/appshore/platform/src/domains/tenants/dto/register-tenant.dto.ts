import { IsString, IsEmail, IsNotEmpty, IsOptional, Matches, MinLength } from 'class-validator';

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

  // Primary credential: first-party password (min 8 chars). Either password
  // or firebaseUid must be provided.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Optional alternative: pre-created Firebase account
  @IsOptional()
  @IsString()
  firebaseUid?: string;

  // Contact information
  @IsString()
  @IsNotEmpty()
  phone: string;

  // Bot protection
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
