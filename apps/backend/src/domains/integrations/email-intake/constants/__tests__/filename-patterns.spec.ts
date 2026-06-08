import { isLikelyRatecon, isBlockedFilename } from '../filename-patterns';

describe('isLikelyRatecon', () => {
  it('matches "ratecon" in filename', () => {
    expect(isLikelyRatecon('ratecon_12345.pdf')).toBe(true);
  });

  it('matches "rate confirmation" in filename', () => {
    expect(isLikelyRatecon('rate confirmation from broker.pdf')).toBe(true);
  });

  it('matches "rate_con" in filename', () => {
    expect(isLikelyRatecon('rate_con_load_001.pdf')).toBe(true);
  });

  it('matches "RC-" prefix (case-insensitive)', () => {
    expect(isLikelyRatecon('RC-2026-0330.pdf')).toBe(true);
  });

  it('matches "confirmation" in filename', () => {
    expect(isLikelyRatecon('load_confirmation.pdf')).toBe(true);
  });

  it('returns false for a generic filename', () => {
    expect(isLikelyRatecon('document.pdf')).toBe(false);
  });

  it('returns false for an invoice filename', () => {
    expect(isLikelyRatecon('invoice_2026.pdf')).toBe(false);
  });
});

describe('isBlockedFilename', () => {
  it('blocks "insurance" filename', () => {
    expect(isBlockedFilename('insurance_certificate.pdf')).toBe(true);
  });

  it('blocks "w9" filename', () => {
    expect(isBlockedFilename('w9_form.pdf')).toBe(true);
  });

  it('blocks "w-9" filename', () => {
    expect(isBlockedFilename('w-9_signed.pdf')).toBe(true);
  });

  it('blocks "invoice" filename', () => {
    expect(isBlockedFilename('invoice_oct_2026.pdf')).toBe(true);
  });

  it('blocks "BOL" filename (case-insensitive)', () => {
    expect(isBlockedFilename('BOL_shipment.pdf')).toBe(true);
  });

  it('blocks "POD" filename (case-insensitive)', () => {
    expect(isBlockedFilename('POD_signed.pdf')).toBe(true);
  });

  it('does NOT block a ratecon filename even if it contains a blocked word', () => {
    expect(isBlockedFilename('ratecon_confirmation.pdf')).toBe(false);
  });

  it('does NOT block a generic filename', () => {
    expect(isBlockedFilename('load_details.pdf')).toBe(false);
  });

  it('does NOT block a rate confirmation filename', () => {
    expect(isBlockedFilename('rate confirmation_0330.pdf')).toBe(false);
  });
});
