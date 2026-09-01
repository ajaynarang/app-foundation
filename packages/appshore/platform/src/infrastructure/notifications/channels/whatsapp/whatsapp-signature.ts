import { createHmac, timingSafeEqual } from 'crypto';

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/** `sha256=<hex>` over the raw body — Meta and Interakt sign the same way, with different secrets. */
export const verifyHmacSha256 = (
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  secret: string,
): boolean => {
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) return false;
  const presented = signatureHeader.slice('sha256='.length);
  // A same-length non-hex string decodes SHORT and timingSafeEqual throws — that would be a 500.
  if (!HEX_SHA256.test(presented)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(presented, 'hex'), Buffer.from(expected, 'hex'));
};

/** A provider's error text can echo the number back. Digit runs never reach a log line. */
export const redact = (text: string): string => text.replace(/\d{5,}/g, '<digits>').slice(0, 160);
