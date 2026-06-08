/**
 * Tenant Reset — Safety gates.
 *
 * Every destructive path calls `assertSafeToProceed` before the DB transaction
 * opens. Gates fail loud with actionable messages.
 */
import { createInterface } from 'node:readline/promises';
import type { PrismaClient } from '@prisma/client';
import type { ResetMode } from './registry';

/**
 * Tenants allowed to be passed to the reset CLI. Do NOT add production
 * customer slugs unless you explicitly want them to be resettable.
 */
export const ALLOWED_TENANTS: readonly string[] = [
  'demo-northstar-2026',
  'tenant_dnwwoo406z', // JY CARRIERS — active (staging)
  'tenant_ww2z36ghg7', // JY CARRIERS — duplicate, suspended (staging)
] as const;

const PROD_HOST_PATTERN = /prod|production/i;
const HARD_MODE_EXTRA_FLAG = '--i-understand-this-deletes-the-tenant';

export interface SafetyOptions {
  readonly tenantSlug: string;
  readonly mode: ResetMode;
  readonly yes: boolean;
  readonly hardConfirm: boolean;
  readonly dryRun: boolean;
}

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyError';
  }
}

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new SafetyError('Refusing to run: NODE_ENV=production.');
  }

  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new SafetyError('DATABASE_URL is not set. Cannot verify target host.');
  }

  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new SafetyError(`DATABASE_URL is not a valid URL: ${url.slice(0, 40)}…`);
  }
  if (PROD_HOST_PATTERN.test(host)) {
    throw new SafetyError(`Refusing to run: DATABASE_URL host "${host}" looks like production.`);
  }
}

function assertAllowlisted(slug: string): void {
  if (!ALLOWED_TENANTS.includes(slug)) {
    const list = ALLOWED_TENANTS.map((t) => `  - ${t}`).join('\n');
    throw new SafetyError(
      `Tenant "${slug}" is not in the allowlist. Edit ALLOWED_TENANTS in ` +
        `scripts/tenant-reset/safety.ts. Current allowlist:\n${list}`,
    );
  }
}

function assertHardModeExtraFlag(options: SafetyOptions): void {
  if (options.mode !== 'hard' || options.dryRun) return;
  if (!options.hardConfirm) {
    throw new SafetyError(
      `Hard mode deletes the tenant row and every related record. ` +
        `Pass ${HARD_MODE_EXTRA_FLAG} to confirm you understand.`,
    );
  }
}

/**
 * Resolves the tenant by slug, returning its integer id + company name.
 * Throws if the tenant doesn't exist.
 */
export async function resolveTenant(
  prisma: PrismaClient,
  slug: string,
): Promise<{ id: number; slug: string; companyName: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: slug },
    select: { id: true, tenantId: true, companyName: true },
  });
  if (!tenant) {
    throw new SafetyError(`Tenant "${slug}" not found in the current database.`);
  }
  return {
    id: tenant.id,
    slug: tenant.tenantId,
    companyName: tenant.companyName,
  };
}

/**
 * Interactive confirmation — user must type the tenant slug exactly. Guards
 * against accidental `--yes` muscle memory targeting the wrong tenant.
 */
export async function promptSlugConfirmation(slug: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await rl.question(`\n  Type the tenant slug exactly to confirm ("${slug}"): `);
    if (typed.trim() !== slug) {
      throw new SafetyError('Confirmation text did not match. Aborted.');
    }
  } finally {
    rl.close();
  }
}

/**
 * Runs every pre-transaction gate. Call once at the start of a reset.
 */
export async function assertSafeToProceed(
  prisma: PrismaClient,
  options: SafetyOptions,
): Promise<{ tenantIntId: number; tenantSlug: string; companyName: string }> {
  assertNotProduction();
  assertAllowlisted(options.tenantSlug);
  assertHardModeExtraFlag(options);

  const tenant = await resolveTenant(prisma, options.tenantSlug);

  if (!options.yes && !options.dryRun) {
    await promptSlugConfirmation(tenant.slug);
  }

  return {
    tenantIntId: tenant.id,
    tenantSlug: tenant.slug,
    companyName: tenant.companyName,
  };
}
