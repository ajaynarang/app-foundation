import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserProfileDto {
  @ApiProperty({ description: 'Numeric database id — used by UI permission checks (e.g. Desk agent supervisor match)' })
  dbId: number;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  emailVerified?: boolean;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({
    enum: ['OWNER', 'ADMIN', 'MEMBER', 'SUPER_ADMIN'],
  })
  role: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ required: false, description: 'Tenant subdomain (multi-tenant mode) — drives post-login redirect' })
  subdomain?: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty({
    required: false,
    description: 'Tenant IANA timezone — display fallback when the user has no timezone preference',
  })
  tenantTimezone?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ required: false })
  phoneVerified?: boolean;

  @ApiProperty({ required: false })
  hasPinSet?: boolean;

  @ApiProperty({ required: false })
  createdAt?: string;

  @ApiProperty({ required: false })
  lastLoginAt?: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'User profile information' })
  user: UserProfileDto;
}
