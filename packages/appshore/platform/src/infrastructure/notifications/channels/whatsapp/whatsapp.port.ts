import type { DeliveryStatus } from '@appshore/db';
import type { DeliverySkipReason } from '../../pipeline/delivery-outcome';

/** DI token — same shape as VIDEO_TRANSCODER and MODERATION_GATE. */
export const WHATSAPP_PORT = Symbol('WHATSAPP_PORT');

export interface WhatsAppTemplateSend {
  /** E.164. */
  to: string;
  templateName: string;
  languageCode: string;
  bodyValues: string[];
  /** Echoed back on status webhooks; we pass the ledger id so a lost send can still be reconciled. */
  callbackData?: string;
}

export type WhatsAppWebhookEvent =
  | {
      kind: 'status';
      providerMessageId: string;
      status: DeliveryStatus;
      at: Date;
      failureReason?: DeliverySkipReason;
      /** Our ledger id, when the provider echoed it back. */
      callbackData?: string;
    }
  | { kind: 'inbound'; from: string; text: string };

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** When the provider said WHY in a way the ledger has a word for (the marketing cap). */
    readonly failureReason?: DeliverySkipReason,
  ) {
    super(message);
    this.name = 'WhatsAppSendError';
  }
}

/**
 * Everything the pipeline needs from a WhatsApp provider. Meta's Cloud API is
 * the default, Interakt is the BSP option, and a third stands in when there
 * are no credentials so a delivery is recorded as skipped rather than crashing.
 */
export interface WhatsAppPort {
  readonly isConfigured: boolean;
  /** For the boot line. */
  readonly providerName: string;
  /** The request header the provider signs, lower-case. */
  readonly signatureHeader: string;
  sendTemplate(send: WhatsAppTemplateSend): Promise<{ providerMessageId: string }>;
  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean;
  /** Providers batch. Anything not understood is simply absent from the list. */
  parseWebhook(body: unknown): WhatsAppWebhookEvent[];
  /** Meta's one-time GET handshake: the challenge to echo back, or null to refuse. */
  verifyChallenge?(query: Record<string, unknown>): string | null;
}
