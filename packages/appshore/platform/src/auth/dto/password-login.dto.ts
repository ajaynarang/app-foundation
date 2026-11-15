import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PasswordLoginDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({
    description:
      "The workspace to sign in to: the tenant's public id, which the web form sends from a tenant subdomain. Only accounts in that workspace are considered.",
    example: 'ten_acme',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantId?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    description:
      "Limit the reset to one workspace: the tenant's public id, which the web form sends from a tenant subdomain. Without it, every account on this email gets its own link.",
    example: 'ten_acme',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenantId?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw token from the reset link' })
  @IsString()
  @MinLength(32)
  token: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class PersonalRegisterDto {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  lastName: string;
}
