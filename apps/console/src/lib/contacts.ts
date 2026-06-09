/**
 * Single source of truth for all contact emails and domains.
 * Keep in sync with apps/web/src/shared/lib/contacts.ts
 */

const DOMAIN = 'appshore.in';

export const CONTACTS = {
  // --- Corporate / functional ---
  /** Legal, privacy, DMCA, DPA inquiries */
  legal: `legal@${DOMAIN}`,
  /** Security disclosures, vulnerability reports */
  security: `security@${DOMAIN}`,
  /** General info */
  info: `info@${DOMAIN}`,
  /** Job inquiries */
  careers: `careers@${DOMAIN}`,

  // --- Product / customer-facing ---
  /** Sales, enterprise, pricing CTAs, general product contact */
  sales: `sales@${DOMAIN}`,
  /** Product support, billing, AI questions, abuse reports */
  appSupport: `app-support@${DOMAIN}`,

  // --- Generic (internal aliases) ---
  /** General contact */
  hello: `hello@${DOMAIN}`,
  /** Generic support alias */
  support: `support@${DOMAIN}`,
} as const;

/** Helper to create mailto: link */
export function mailto(email: keyof typeof CONTACTS | string, subject?: string): string {
  const address = email in CONTACTS ? CONTACTS[email as keyof typeof CONTACTS] : email;
  return subject ? `mailto:${address}?subject=${encodeURIComponent(subject)}` : `mailto:${address}`;
}
