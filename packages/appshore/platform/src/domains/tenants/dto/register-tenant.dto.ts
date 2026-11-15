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
  // or firebaseIdToken must be provided.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Optional alternative: a Firebase ID token for `email`, verified on the server. The owner's uid comes only from
  // the verified token, never from the body.
  @ApiPropertyOptional({ description: 'A Firebase ID token for `email`, verified on the server; or send password' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firebaseIdToken?: string;

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
