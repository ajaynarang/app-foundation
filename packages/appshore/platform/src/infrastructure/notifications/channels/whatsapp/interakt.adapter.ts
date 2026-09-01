import { Logger } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { DeliveryStatus } from '@appshore/db';
import { DELIVERY_SKIP_REASONS } from '../../pipeline/delivery-outcome';
import { INTERAKT_API_BASE_URL, INTERAKT_SIGNATURE_HEADER, META_MARKETING_CAP_ERROR_CODE } from './whatsapp.constants';
import { redact, verifyHmacSha256 } from './whatsapp-signature';
import {
  WhatsAppSendError,
  type WhatsAppPort,
  type WhatsAppTemplateSend,
  type WhatsAppWebhookEvent,
} from './whatsapp.port';

const STATUS_BY_EVENT: Record<string, DeliveryStatus> = {
  message_api_sent: DeliveryStatus.SENT,
  message_api_delivered: DeliveryStatus.DELIVERED,
  message_api_read: DeliveryStatus.READ,
  message_api_failed: DeliveryStatus.FAILED,
};

interface InteraktWebhook {
  type?: string;
  timestamp?: string;
  data?: {
    customer?: { channel_phone_number?: string };
    message?: {
      id?: string;
      message?: string;
      received_at_utc?: string;
      delivered_at_utc?: string;
      channel_failure_reason?: string;
      channel_error_code?: number | string;
      meta_data?: { source_data?: { callback_data?: string } };
    };
  };
}

/** Interakt's public API. Constructed by the module factory, never injected directly. */
export class InteraktWhatsAppAdapter implements WhatsAppPort {
  readonly isConfigured = true;
  readonly providerName = 'Interakt';
  readonly signatureHeader = INTERAKT_SIGNATURE_HEADER;
  private readonly logger = new Logger(InteraktWhatsAppAdapter.name);

  constructor(private readonly config: { apiKey: string; webhookSecret: string }) {}

  async sendTemplate(send: WhatsAppTemplateSend): Promise<{ providerMessageId: string }> {
    const parsed = parsePhoneNumberFromString(send.to);
    if (!parsed?.isValid()) throw new WhatsAppSendError('Recipient number is not E.164', false);

    let response: Response;
    try {
      response = await fetch(`${INTERAKT_API_BASE_URL}/message/`, {
        method: 'POST',
        headers: { Authorization: `Basic ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode: `+${parsed.countryCallingCode}`,
          // Interakt wants the national number without a trunk prefix; libphonenumber
          // keeps Italy's leading 0, for one.
          phoneNumber: parsed.nationalNumber.replace(/^0+/, ''),
          type: 'Template',
          ...(send.callbackData ? { callbackData: send.callbackData } : {}),
          template: { name: send.templateName, languageCode: send.languageCode, bodyValues: send.bodyValues },
        }),
      });
    } catch (err: any) {
      throw new WhatsAppSendError(`Interakt unreachable: ${redact(String(err.message))}`, true);
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      const detail = await response.text().catch(() => '');
      throw new WhatsAppSendError(`Interakt ${response.status}: ${redact(detail)}`, retryable);
    }

    const body = (await response.json()) as { result?: boolean; id?: string; message?: string };
    if (!body.id) throw new WhatsAppSendError(`Interakt accepted nothing: ${redact(body.message ?? 'no id')}`, false);
    return { providerMessageId: body.id };
  }

  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    return verifyHmacSha256(rawBody, signatureHeader, this.config.webhookSecret);
  }

  /** Interakt sends one event per call. */
  parseWebhook(body: unknown): WhatsAppWebhookEvent[] {
    if (!body || typeof body !== 'object') return [];
    const hook = body as InteraktWebhook;
    const message = hook.data?.message;

    if (hook.type === 'message_received') {
      const digits = hook.data?.customer?.channel_phone_number?.replace(/\D/g, '');
      if (!digits || typeof message?.message !== 'string') return [];
      return [{ kind: 'inbound', from: `+${digits}`, text: message.message }];
    }

    const status = hook.type ? STATUS_BY_EVENT[hook.type] : undefined;
    if (!status || !message?.id) return [];

    const stamp = message.delivered_at_utc ?? message.received_at_utc ?? hook.timestamp;
    const parsedAt = stamp ? new Date(stamp) : new Date();
    const at = Number.isNaN(parsedAt.getTime()) ? new Date() : parsedAt;
    const callbackData = message.meta_data?.source_data?.callback_data;
    const base = {
      kind: 'status' as const,
      providerMessageId: message.id,
      status,
      at,
      ...(callbackData ? { callbackData } : {}),
    };

    if (status === DeliveryStatus.FAILED) {
      // The provider's wording is for the log; the row gets our vocabulary.
      this.logger.warn(
        `WhatsApp message ${message.id} failed at the provider: ${message.channel_error_code ?? ''} ${redact(String(message.channel_failure_reason ?? ''))}`.trim(),
      );
      const capped = String(message.channel_error_code ?? '') === String(META_MARKETING_CAP_ERROR_CODE);
      return [
        { ...base, failureReason: capped ? DELIVERY_SKIP_REASONS.MARKETING_CAP : DELIVERY_SKIP_REASONS.PROVIDER_ERROR },
      ];
    }
    return [base];
  }
}
