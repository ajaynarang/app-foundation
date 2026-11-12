import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, IsOptional, Matches, MinLength } from 'class-validator';

export class RegisterTenantDto {
  // Company information
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomain must contain only lowercase letters, numbers, and hyphens',
  })
  subdomain: string;

  // Admin user information
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  // Primary credential: first-party password (min 8 chars). Either password
  // or firebaseUid must be provided.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Optional alternative: pre-created Firebase account
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firebaseUid?: string;

  // Contact information
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone: string;

  // Bot protection
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
