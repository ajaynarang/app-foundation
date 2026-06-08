import { IsString, IsEmail, IsNotEmpty, IsEnum, IsOptional, IsNumber, Matches, Length } from 'class-validator';
import { UserRole } from '@prisma/client';

export class InviteUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone must be E.164 format (e.g. +12025551234)',
  })
  phone?: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEnum(UserRole)
  role: UserRole;

  /**
   * Optional tenant ID (required for SUPER_ADMIN inviting users)
   * For ADMIN users, this is automatically set to their tenant
   */
  @IsOptional()
  @IsNumber()
  tenantId?: number;
}

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  firebaseUid: string;
}

export class AcceptPhoneInvitationDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be E.164 format' })
  phone: string;

  @IsString()
  @Length(4, 8)
  otp: string;

  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin: string;
}
