import { Logger } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { DeliveryStatus } from '@appshore/db';
import { DELIVERY_SKIP_REASONS } from '../../pipeline/delivery-outcome';
import {
  META_GRAPH_API_BASE_URL,
  META_MARKETING_CAP_ERROR_CODE,
  META_RETRYABLE_ERROR_CODES,
  META_SIGNATURE_HEADER,
} from './whatsapp.constants';
import { redact, verifyHmacSha256 } from './whatsapp-signature';
import {
  WhatsAppSendError,
  type WhatsAppPort,
  type WhatsAppTemplateSend,
  type WhatsAppWebhookEvent,
} from './whatsapp.port';

const STATUS_BY_NAME: Record<string, DeliveryStatus> = {
  sent: DeliveryStatus.SENT,
  delivered: DeliveryStatus.DELIVERED,
  read: DeliveryStatus.READ,
  failed: DeliveryStatus.FAILED,
};

/** The one object Meta posts to a WhatsApp webhook. Only the fields we read. */
interface MetaWebhook {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        messaging_product?: string;
        statuses?: MetaStatus[];
        messages?: MetaMessage[];
      };
    }[];
  }[];
}

interface MetaStatus {
  id?: string;
  status?: string;
  /** Unix seconds, as a string. */
  timestamp?: string;
  recipient_id?: string;
  biz_opaque_callback_data?: string;
  errors?: { code?: number | string; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface MetaMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string } };
}

interface MetaErrorBody {
  error?: { code?: number | string; message?: string; error_subcode?: number; error_data?: { details?: string } };
}

const unixToDate = (seconds: string | undefined): Date => {
  const at = new Date(Number(seconds) * 1000);
  return seconds && !Number.isNaN(at.getTime()) ? at : new Date();
};

/** Meta's WhatsApp Cloud API, spoken to directly. Constructed by the factory, never injected. */
export class MetaCloudWhatsAppAdapter implements WhatsAppPort {
  readonly isConfigured = true;
  readonly providerName = 'Meta Cloud API';
  readonly signatureHeader = META_SIGNATURE_HEADER;
  private readonly logger = new Logger(MetaCloudWhatsAppAdapter.name);

  constructor(
    private readonly config: {
      accessToken: string;
      appSecret: string;
      phoneNumberId: string;
      verifyToken?: string;
      /** Meta's Graph host by default; a local emulator or a fake in a test run. */
      baseUrl?: string;
    },
  ) {}

  private get baseUrl(): string {
    return (this.config.baseUrl ?? META_GRAPH_API_BASE_URL).replace(/\/+$/, '');
  }

  async sendTemplate(send: WhatsAppTemplateSend): Promise<{ providerMessageId: string }> {
    const parsed = parsePhoneNumberFromString(send.to);
    if (!parsed?.isValid()) throw new WhatsAppSendError('Recipient number is not E.164', false);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${this.config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          // Meta wants the E.164 digits without the plus.
          to: parsed.number.slice(1),
          type: 'template',
          template: {
            name: send.templateName,
            language: { code: send.languageCode },
            ...(send.bodyValues.length > 0
              ? {
                  components: [{ type: 'body', parameters: send.bodyValues.map((text) => ({ type: 'text', text })) }],
                }
              : {}),
          },
          ...(send.callbackData ? { biz_opaque_callback_data: send.callbackData } : {}),
        }),
      });
    } catch (err: any) {
      throw new WhatsAppSendError(`Meta unreachable: ${redact(String(err.message))}`, true);
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as MetaErrorBody;
      const code = Number(body.error?.code);
      const retryable = response.status === 429 || response.status >= 500 || META_RETRYABLE_ERROR_CODES.has(code);
      const detail = body.error?.error_data?.details ?? body.error?.message ?? '';
      throw new WhatsAppSendError(
        `Meta ${response.status}${code ? ` (${code})` : ''}: ${redact(detail)}`,
        retryable,
        code === META_MARKETING_CAP_ERROR_CODE ? DELIVERY_SKIP_REASONS.MARKETING_CAP : undefined,
      );
    }

    const body = (await response.json()) as { messages?: { id?: string }[] };
    const id = body.messages?.[0]?.id;
    if (!id) throw new WhatsAppSendError('Meta accepted nothing: no message id in the response', false);
    return { providerMessageId: id };
  }

  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    return verifyHmacSha256(rawBody, signatureHeader, this.config.appSecret);
  }

  verifyChallenge(query: Record<string, unknown>): string | null {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = query;
    if (!this.config.verifyToken || mode !== 'subscribe' || token !== this.config.verifyToken) return null;
    return typeof challenge === 'string' ? challenge : null;
  }

  /** One POST can carry many statuses and messages across several entries; every one is an event. */
  parseWebhook(body: unknown): WhatsAppWebhookEvent[] {
    if (!body || typeof body !== 'object') return [];
    const hook = body as MetaWebhook;
    if (hook.object !== 'whatsapp_business_account') return [];

    const events: WhatsAppWebhookEvent[] = [];
    for (const entry of hook.entry ?? []) {
      for (const change of entry.changes ?? []) {
        // Statuses and inbound messages arrive under the `messages` field; other subscribed
        // fields (account, template, quality updates) carry their own shapes and are not ours.
        if (change.field !== 'messages') continue;
        for (const status of change.value?.statuses ?? []) {
          const event = this.statusEvent(status);
          if (event) events.push(event);
        }
        for (const message of change.value?.messages ?? []) {
          const event = this.inboundEvent(message);
          if (event) events.push(event);
        }
      }
    }
    return events;
  }

  private statusEvent(status: MetaStatus): WhatsAppWebhookEvent | null {
    const mapped = status.status ? STATUS_BY_NAME[status.status] : undefined;
    if (!mapped || !status.id) return null;
    const base = {
      kind: 'status' as const,
      providerMessageId: status.id,
      status: mapped,
      at: unixToDate(status.timestamp),
      ...(status.biz_opaque_callback_data ? { callbackData: status.biz_opaque_callback_data } : {}),
    };
    if (mapped !== DeliveryStatus.FAILED) return base;

    const first = status.errors?.[0];
    // The provider's wording is for the log; the row gets our vocabulary.
    this.logger.warn(
      `WhatsApp message ${status.id} failed at Meta: ${first?.code ?? ''} ${redact(String(first?.error_data?.details ?? first?.title ?? ''))}`.trim(),
    );
    const capped = Number(first?.code) === META_MARKETING_CAP_ERROR_CODE;
    return {
      ...base,
      failureReason: capped ? DELIVERY_SKIP_REASONS.MARKETING_CAP : DELIVERY_SKIP_REASONS.PROVIDER_ERROR,
    };
  }

  /** A typed reply, a quick-reply button, or an interactive button — the text is what the person said. */
  private inboundEvent(message: MetaMessage): WhatsAppWebhookEvent | null {
    const digits = message.from?.replace(/\D/g, '');
    const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title;
    if (!digits || typeof text !== 'string') return null;
    return { kind: 'inbound', from: `+${digits}`, text };
  }
}
