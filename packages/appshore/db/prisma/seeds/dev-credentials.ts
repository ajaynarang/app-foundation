import * as bcrypt from 'bcrypt';

/**
 * Development login credentials for seeded identities.
 *
 * In any non-production environment the seeds attach a known password,
 * phone and PIN to the bootstrap users so a fresh clone can log in
 * immediately — no Firebase, no Twilio, no env edits:
 *
 *   owner@example.com / Password123!   (tenant owner)
 *   admin@example.com / Password123!   (platform super admin)
 *   phone +1 555 555 0100, PIN 1234, mock OTP 123456
 *
 * In production (ENV_TYPE=production) NO default credentials are seeded —
 * set SUPER_ADMIN_PASSWORD / DEFAULT_ADMIN_PASSWORD explicitly, or create
 * accounts through your identity provider.
 */

const IS_PRODUCTION = process.env.ENV_TYPE?.toLowerCase() === 'production';

export const DEV_OWNER_PHONE = '+15555550100';
export const DEV_SUPERADMIN_PHONE = '+15555550199';

export function devPassword(explicit?: string): string | null {
  if (explicit) return explicit;
  if (IS_PRODUCTION) return null;
  return 'Password123!';
}

export function devPin(): string | null {
  return IS_PRODUCTION ? null : process.env.DEV_LOGIN_PIN || '1234';
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

/** Build the optional credential columns for a seeded user. */
export async function devCredentialColumns(explicitPassword: string | undefined, phone: string) {
  const password = devPassword(explicitPassword);
  const pin = devPin();
  return {
    ...(password ? { passwordHash: await hashPassword(password) } : {}),
    ...(pin ? { phone, phoneVerified: true, pinHash: await hashPin(pin) } : {}),
  };
}

export function printCredentialSummary(): void {
  if (IS_PRODUCTION) return;
  const password = devPassword(undefined);
  console.log(`
  ── Dev login credentials (non-production only) ─────────────────────
    Tenant owner : owner@example.com / ${password}
    Super admin  : admin@example.com / ${process.env.SUPER_ADMIN_PASSWORD || password}
    Phone + PIN  : ${DEV_OWNER_PHONE} PIN ${devPin()}  (mock OTP: ${process.env.TWILIO_MOCK_OTP || '123456'})
  ────────────────────────────────────────────────────────────────────`);
}
