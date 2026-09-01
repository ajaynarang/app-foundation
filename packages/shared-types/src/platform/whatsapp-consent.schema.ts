import { z } from 'zod';

/** What the user sees: two yeses, both theirs to withdraw. */
export const WhatsAppConsentSchema = z.object({
  optedIn: z.boolean(),
  marketingOptedIn: z.boolean(),
});
export type WhatsAppConsent = z.infer<typeof WhatsAppConsentSchema>;

/** INBOUND_STOP is not a client's to send — it arrives on the webhook. */
export const WHATSAPP_CONSENT_CLIENT_SOURCES = ['SIGNUP', 'SETTINGS'] as const;

export const UpdateWhatsAppConsentSchema = z
  .object({
    optedIn: z.boolean().optional(),
    marketingOptedIn: z.boolean().optional(),
    source: z.enum(WHATSAPP_CONSENT_CLIENT_SOURCES).optional(),
  })
  .refine((v) => v.optedIn !== undefined || v.marketingOptedIn !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateWhatsAppConsent = z.infer<typeof UpdateWhatsAppConsentSchema>;
