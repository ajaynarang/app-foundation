import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserLookupDto {
  @ApiProperty({
    description: 'Email address to lookup',
    example: 'dispatcher1@swift.com',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'Phone number to lookup (future enhancement)',
    example: '+1234567890',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;
}

export class UserLookupResultDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;
}

export class UserLookupResponseDto {
  @ApiProperty({ type: [UserLookupResultDto] })
  users: UserLookupResultDto[];

  @ApiProperty({ description: 'True if user exists in multiple tenants' })
  multiTenant: boolean;
}

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
