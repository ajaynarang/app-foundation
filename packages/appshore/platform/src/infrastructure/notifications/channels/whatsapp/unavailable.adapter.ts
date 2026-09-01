import { META_SIGNATURE_HEADER } from './whatsapp.constants';
import {
  WhatsAppSendError,
  type WhatsAppPort,
  type WhatsAppTemplateSend,
  type WhatsAppWebhookEvent,
} from './whatsapp.port';

/** Bound when WHATSAPP_* env is absent. A delivery records NOT_CONFIGURED; nothing throws into it. */
export class UnavailableWhatsAppAdapter implements WhatsAppPort {
  readonly isConfigured = false;
  readonly providerName = 'not configured';
  readonly signatureHeader = META_SIGNATURE_HEADER;

  sendTemplate(_send: WhatsAppTemplateSend): Promise<{ providerMessageId: string }> {
    return Promise.reject(new WhatsAppSendError('WhatsApp is not configured on this deployment', false));
  }

  verifySignature(_rawBody: Buffer | undefined, _signatureHeader: string | undefined): boolean {
    return false;
  }

  parseWebhook(_body: unknown): WhatsAppWebhookEvent[] {
    return [];
  }
}
