import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be E.164 format' })
  phone: string;

  @ApiProperty()
  @IsString()
  @Length(4, 8) // Twilio sends 6, mock is 4
  code: string;
}

/** OTP sign-in: the code, plus the workspace hint. (Verifying a phone on an existing account takes no hint.) */
export class VerifyOtpLoginDto extends VerifyOtpDto {
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
