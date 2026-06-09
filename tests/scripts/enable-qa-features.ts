#!/usr/bin/env tsx

/**
 * enable-qa-features.ts — Idempotent script that enables ALL plan entitlements
 * on a target tenant. Designed for local dev and CI warm-up, not production.
 *
 * Usage:
 *   pnpm qa:enable-features [--tenant <id>] [--dry-run]
 */

import { fetchDevUsers, switchToUser } from '@app/test-utils/auth';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_TENANT = 'demo-northstar-2026';

// ── Argument parsing ──────────────────────────────────────────────────────────

interface CliArgs {
  tenantId: string;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let tenantId = DEFAULT_TENANT;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant' && args[i + 1]) {
      tenantId = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { tenantId, dryRun };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanEntitlement {
  feature: string;
  displayName: string;
  enabled: boolean;
}

interface TenantPlanDetails {
  plan: string;
  planConfig: {
    plan: string;
    entitlements: PlanEntitlement[];
  } | null;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function getTenantPlanDetails(baseUrl: string, token: string, tenantId: string): Promise<TenantPlanDetails> {
  const res = await fetch(`${baseUrl}/plans/tenant/${tenantId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET /plans/tenant/${tenantId} failed with HTTP ${res.status}. Body: ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<TenantPlanDetails>;
}

async function enableEntitlement(baseUrl: string, token: string, planKey: string, feature: string): Promise<void> {
  const res = await fetch(`${baseUrl}/plans/${planKey}/entitlements/${feature}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled: true }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `PATCH /plans/${planKey}/entitlements/${feature} failed with HTTP ${res.status}. Body: ${body.slice(0, 200)}`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { tenantId, dryRun } = parseArgs();
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:8001/api/v1';

  console.log(`\n  Platform — Enable QA Features`);
  console.log(`  Tenant:  ${tenantId}`);
  console.log(`  Backend: ${baseUrl}`);
  if (dryRun) console.log(`  Mode:    DRY RUN (no changes will be made)`);
  console.log('');

  // Acquire a super-admin token via the dev-switcher.
  let devUsers: Awaited<ReturnType<typeof fetchDevUsers>>;
  try {
    devUsers = await fetchDevUsers(baseUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Error: Could not reach backend at ${baseUrl}.`);
    console.error(`  Detail: ${msg}`);
    console.error(`  Ensure the backend is running and DEV_AUTH_SECRET is set.`);
    process.exit(1);
  }

  const superAdmin = devUsers.superAdmins[0];
  if (!superAdmin) {
    console.error(`  Error: No SUPER_ADMIN user found in /dev/users.`);
    console.error(`  Run the seed scripts to create a super-admin: pnpm setup:base`);
    process.exit(1);
  }

  const token = await switchToUser(baseUrl, superAdmin.userId);

  // Fetch current plan details for the target tenant.
  let details: TenantPlanDetails;
  try {
    details = await getTenantPlanDetails(baseUrl, token, tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Error: Could not fetch plan details for tenant "${tenantId}".`);
    console.error(`  Detail: ${msg}`);
    process.exit(1);
  }

  if (!details.planConfig) {
    console.error(`  Error: Tenant "${tenantId}" has no plan config (plan: ${details.plan}).`);
    console.error(`  Assign a plan first: PATCH /plans/tenant/${tenantId}`);
    process.exit(1);
  }

  const { plan, entitlements } = details.planConfig;
  const toEnable = entitlements.filter((e) => !e.enabled);
  const alreadyEnabled = entitlements.filter((e) => e.enabled);

  console.log(`  Plan:    ${plan}`);
  console.log(`  Already enabled: ${alreadyEnabled.length}`);
  console.log(`  To enable:       ${toEnable.length}`);
  console.log('');

  if (toEnable.length === 0) {
    console.log(`  All ${alreadyEnabled.length} entitlements already enabled. Nothing to do.`);
    console.log('');
    return;
  }

  let enabledCount = 0;
  let errorCount = 0;

  for (const entitlement of toEnable) {
    const label = `${entitlement.displayName} (${entitlement.feature})`;

    if (dryRun) {
      console.log(`  [DRY RUN] Would enable: ${label}`);
      enabledCount++;
      continue;
    }

    try {
      await enableEntitlement(baseUrl, token, plan, entitlement.feature);
      console.log(`  Enabled: ${label}`);
      enabledCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed to enable ${label}: ${msg}`);
      errorCount++;
    }
  }

  console.log('');
  if (dryRun) {
    console.log(`  [DRY RUN] Would enable ${enabledCount} features, skip ${alreadyEnabled.length} already-enabled.`);
  } else {
    console.log(`  Enabled ${enabledCount} features, skipped ${alreadyEnabled.length} already-enabled.`);
  }
  if (errorCount > 0) {
    console.error(`  ${errorCount} feature(s) failed to enable.`);
    process.exit(1);
  }
  console.log('');
}

main().catch((err) => {
  console.error(`\n  Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
