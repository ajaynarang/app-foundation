import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SendOtpDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'Phone must be E.164 format (e.g. +12025551234)',
  })
  phone: string;

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
