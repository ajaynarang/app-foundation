import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WHATSAPP_CONSENT_CLIENT_SOURCES, type UpdateWhatsAppConsent } from '@app/shared-types';

export class UpdateWhatsAppConsentDto implements UpdateWhatsAppConsent {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  optedIn?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  marketingOptedIn?: boolean;

  /** SIGNUP from the phone-login screen, SETTINGS otherwise. INBOUND_STOP only ever arrives on the webhook. */
  @ApiPropertyOptional({ enum: WHATSAPP_CONSENT_CLIENT_SOURCES })
  @IsOptional()
  @IsIn(WHATSAPP_CONSENT_CLIENT_SOURCES)
  source?: (typeof WHATSAPP_CONSENT_CLIENT_SOURCES)[number];
}
