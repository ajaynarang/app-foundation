import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsNumber,
  Matches,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';
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

/**
 * `POST /invitations/preview`: the token travels in the body, so it never reaches a URL path or a request log. An
 * empty or malformed token is not a validation error: it is an invitation nobody has, so the answer is 404.
 */
export class PreviewInvitationDto {
  @ApiProperty({ description: 'Invitation acceptance token (from the invite link)' })
  @IsString()
  @MaxLength(255)
  token: string;
}

/**
 * `POST /invitations/accept` (public): create a NEW account from an email invitation. The credential is a password
 * (the first-party path) or a Firebase ID token, which the server verifies and takes the uid from: never a uid from
 * the body. Exactly one of the two; both or neither is 400 VALIDATION_FAILED. An email that already has an account
 * is 409 SIGN_IN_TO_ACCEPT: that account joins with `POST /invitations/join`, signed in.
 */
export class AcceptInvitationDto {
  @ApiProperty({ description: 'Invitation acceptance token (from the invite link)' })
  @IsString()
  @MinLength(16)
  @MaxLength(255)
  token: string;

  @ApiPropertyOptional({ description: "The new account's password (at least 8 characters); or send firebaseIdToken" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    description: 'A Firebase ID token for the invited email, verified on the server; or send password',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firebaseIdToken?: string;
}

/** `POST /invitations/join` (signed in): the caller's own account joins the invitation's workspace. */
export class JoinInvitationDto {
  @ApiProperty({ description: 'Invitation acceptance token (from the invite link)' })
  @IsString()
  @MaxLength(255)
  token: string;
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
