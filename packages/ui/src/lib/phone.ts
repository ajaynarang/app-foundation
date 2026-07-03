import { parsePhoneNumber, isValidPhoneNumber, AsYouType, CountryCode } from 'libphonenumber-js';

/**
 * Format an E.164 string for display.
 * "+15551234567" → "(555) 123-4567"
 * Returns the original string if unparseable (graceful fallback).
 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  try {
    const parsed = parsePhoneNumber(e164);
    return parsed ? parsed.formatNational() : e164;
  } catch {
    return e164;
  }
}

/**
 * Returns true only if value is valid E.164: +[country][number]
 */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value) && isValidPhoneNumber(value);
}

/**
 * Convert a national-format string + country code to E.164.
 * Returns null if the number is incomplete or invalid.
 */
export function toE164(national: string, country: CountryCode): string | null {
  try {
    const parsed = parsePhoneNumber(national, country);
    return parsed?.isValid() ? parsed.format('E.164') : null;
  } catch {
    return null;
  }
}

/**
 * Format digits as the user types (as-you-type formatter).
 * Used inside PhoneInput for display.
 */
export function formatAsYouType(digits: string, country: CountryCode): string {
  const formatter = new AsYouType(country);
  return formatter.input(digits);
}
