/**
 * Tenant reset: the checks that run before anything is deleted.
 *
 * `assertSafeToProceed` runs every gate once, before the transaction opens. Each gate fails with a message that says
 * what to change.
 */
import { createInterface } from 'node:readline/promises';
import type { ResetMode } from './registry';

/**
 * The only tenants the reset may touch, by public id (`Tenant.tenantId`). The template ships the two seeded demo
 * workspaces. Add your own QA or demo tenants here; never a customer's.
 */
export const ALLOWED_TENANTS: readonly string[] = Object.freeze(['demo', 'demo-two']);

export const HARD_CONFIRM_FLAG = '--i-understand-this-deletes-the-tenant';

/** A database host that names production is refused whatever else is set. */
const PRODUCTION_HOST_PATTERN = /prod|production/i;

export interface SafetyOptions {
  readonly tenantId: string;
  readonly mode: ResetMode;
  readonly yes: boolean;
  readonly hardConfirm: boolean;
  readonly dryRun: boolean;
}

export interface ResolvedTenant {
  readonly tenantDbId: number;
  readonly tenantId: string;
  readonly companyName: string;
}

/** The one Prisma read the gates need. */
export interface TenantLookup {
  tenant: {
    findUnique(args: {
      where: { tenantId: string };
      select: { id: true; tenantId: true; companyName: true };
    }): Promise<{ id: number; tenantId: string; companyName: string } | null>;
  };
}

export class SafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafetyError';
  }
}

/**
 * Refuses a production process and a production-looking database. `ENV_TYPE` names the environment; a deployed image
 * also sets `NODE_ENV=production`, so either one refuses. `DATABASE_URL` must be set: there is no default target.
 */
export function assertNotProduction(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ENV_TYPE === 'production') {
    throw new SafetyError('Refusing to run: ENV_TYPE=production.');
  }
  if (env.NODE_ENV === 'production') {
    throw new SafetyError('Refusing to run: NODE_ENV=production (a deployed process).');
  }
  const url = env.DATABASE_URL ?? '';
  if (!url) {
    throw new SafetyError('DATABASE_URL is not set. Name the database to reset; there is no default.');
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new SafetyError('DATABASE_URL is not a valid URL.');
  }
  if (PRODUCTION_HOST_PATTERN.test(host)) {
    throw new SafetyError(`Refusing to run: the DATABASE_URL host "${host}" looks like production.`);
  }
}

export function assertAllowlisted(tenantId: string, allowed: readonly string[] = ALLOWED_TENANTS): void {
  if (!allowed.includes(tenantId)) {
    const list = allowed.map((t) => `  - ${t}`).join('\n');
    throw new SafetyError(
      `Tenant "${tenantId}" is not in the allow-list. Add it to ALLOWED_TENANTS in ` +
        `apps/backend/scripts/tenant-reset/safety.ts if it is a test tenant. Allowed now:\n${list}`,
    );
  }
}

export function assertHardConfirmed(options: SafetyOptions): void {
  if (options.mode !== 'hard' || options.dryRun) return;
  if (!options.hardConfirm) {
    throw new SafetyError(
      `Hard mode deletes the tenant row and everything that belongs to it. Pass ${HARD_CONFIRM_FLAG} to confirm.`,
    );
  }
}

export async function resolveTenant(prisma: TenantLookup, tenantId: string): Promise<ResolvedTenant> {
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId },
    select: { id: true, tenantId: true, companyName: true },
  });
  if (!tenant) {
    throw new SafetyError(`Tenant "${tenantId}" was not found in this database.`);
  }
  return { tenantDbId: tenant.id, tenantId: tenant.tenantId, companyName: tenant.companyName };
}

/** The operator types the tenant id exactly; a habit of typing "yes" cannot reset the wrong tenant. */
export async function promptTenantConfirmation(tenantId: string): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await rl.question(`\n  Type the tenant id to confirm ("${tenantId}"): `);
    if (typed.trim() !== tenantId) {
      throw new SafetyError('The text did not match the tenant id. Nothing was changed.');
    }
  } finally {
    rl.close();
  }
}

/** Every gate, in order: not production, allow-listed, hard mode confirmed, tenant exists, the typed id. */
export async function assertSafeToProceed(prisma: TenantLookup, options: SafetyOptions): Promise<ResolvedTenant> {
  assertNotProduction();
  assertAllowlisted(options.tenantId);
  assertHardConfirmed(options);
  const tenant = await resolveTenant(prisma, options.tenantId);
  if (!options.yes && !options.dryRun) {
    await promptTenantConfirmation(tenant.tenantId);
  }
  return tenant;
}
