import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InteraktWhatsAppAdapter } from './interakt.adapter';
import { MetaCloudWhatsAppAdapter } from './meta-cloud.adapter';
import { UnavailableWhatsAppAdapter } from './unavailable.adapter';
import { WHATSAPP_PROVIDER_DEFAULT, WHATSAPP_PROVIDERS } from './whatsapp.constants';
import type { WhatsAppPort } from './whatsapp.port';

/**
 * Which provider the two keys belong to. Without both keys every delivery is a
 * NOT_CONFIGURED row, never a throw; a half-configured Meta setup is treated
 * the same way and says so once at boot.
 */
export function createWhatsAppPort(config: ConfigService, logger = new Logger('WhatsAppPort')): WhatsAppPort {
  const apiKey = config.get<string>('WHATSAPP_API_KEY');
  const webhookSecret = config.get<string>('WHATSAPP_WEBHOOK_SECRET');
  if (!apiKey || !webhookSecret) return new UnavailableWhatsAppAdapter();

  const provider = (config.get<string>('WHATSAPP_PROVIDER') ?? WHATSAPP_PROVIDER_DEFAULT).toLowerCase();
  if (provider === WHATSAPP_PROVIDERS.INTERAKT) return new InteraktWhatsAppAdapter({ apiKey, webhookSecret });
  if (provider !== WHATSAPP_PROVIDERS.META) {
    logger.warn(`Unknown WHATSAPP_PROVIDER "${provider}" — WhatsApp stays off`);
    return new UnavailableWhatsAppAdapter();
  }

  const phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
  if (!phoneNumberId) {
    logger.warn('WHATSAPP_PHONE_NUMBER_ID is not set — WhatsApp stays off');
    return new UnavailableWhatsAppAdapter();
  }
  return new MetaCloudWhatsAppAdapter({
    accessToken: apiKey,
    appSecret: webhookSecret,
    phoneNumberId,
    verifyToken: config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    baseUrl: config.get<string>('WHATSAPP_GRAPH_API_BASE_URL'),
  });
}
