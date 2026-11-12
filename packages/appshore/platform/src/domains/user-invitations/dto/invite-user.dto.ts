import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, IsEnum, IsOptional, IsNumber, Matches, Length } from 'class-validator';
import { UserRole } from '@appshore/db';

export class InviteUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone must be E.164 format (e.g. +12025551234)',
  })
  phone?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  /**
   * Optional tenant ID (required for SUPER_ADMIN inviting users)
   * For ADMIN users, this is automatically set to their tenant
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  tenantId?: number;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firebaseUid: string;
}

export class AcceptPhoneInvitationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be E.164 format' })
  phone: string;

  @ApiProperty()
  @IsString()
  @Length(4, 8)
  otp: string;

  @ApiProperty()
  @IsString()
  @Length(4, 4)
  @Matches(/^\d{4}$/, { message: 'PIN must be 4 digits' })
  pin: string;
}
