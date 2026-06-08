import { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fetchDevUsers, switchToUser, type AuthState, type DevUsersResponse } from '@sally/test-utils/auth';
import { ENV } from './test-env.js';
import { detectCapabilities, buildCapabilitiesJson } from './detect-capabilities.js';

const ALL_TENANT_ROLES = ['OWNER', 'ADMIN', 'DISPATCHER', 'DRIVER', 'CUSTOMER'];
const AUTH_STATE_PATH = path.join(import.meta.dirname, 'auth-state.json');
const CAPABILITIES_PATH = path.join(import.meta.dirname, 'tenant-capabilities.json');

export type { AuthState };

function printAvailableTenants(data: DevUsersResponse): void {
  console.error('\nAvailable tenants:\n');
  data.tenants.forEach((t, i) => {
    const roles = t.users.map((u) => u.role).join(', ');
    console.error(`  ${i + 1}. ${t.tenantId}  — ${t.tenantName} (${roles})`);
  });
  console.error(`\n  Super Admins: ${data.superAdmins.length}`);
  data.superAdmins.forEach((sa) => {
    console.error(`    - ${sa.email} (${sa.firstName} ${sa.lastName})`);
  });
  console.error(`\nUsage: TENANT_ID=<id> npx playwright test\n`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseUrl = ENV.apiBaseUrl;
  const tenantId = ENV.tenantId;

  const data = await fetchDevUsers(baseUrl);

  if (!tenantId) {
    printAvailableTenants(data);
    throw new Error('TENANT_ID env var is required');
  }

  const tenant = data.tenants.find((t) => t.tenantId === tenantId);
  if (!tenant) {
    printAvailableTenants(data);
    throw new Error(`Tenant "${tenantId}" not found`);
  }

  const tokens: Record<string, string> = {};
  const users: AuthState['users'] = {};
  const availableRoles: string[] = [];
  const missingRoles: string[] = [];

  for (const role of ALL_TENANT_ROLES) {
    const u = tenant.users.find((x) => x.role === role);
    if (!u) {
      missingRoles.push(role);
      continue;
    }
    tokens[role] = await switchToUser(baseUrl, u.userId);
    users[role] = u;
    availableRoles.push(role);
  }

  if (data.superAdmins.length > 0) {
    const sa = data.superAdmins[0];
    tokens['SUPER_ADMIN'] = await switchToUser(baseUrl, sa.userId);
    users['SUPER_ADMIN'] = sa;
    availableRoles.push('SUPER_ADMIN');
  } else {
    missingRoles.push('SUPER_ADMIN');
  }

  const state: AuthState = {
    tenantId: tenant.tenantId,
    tenantName: tenant.tenantName,
    tokens,
    users,
    availableRoles,
    missingRoles,
    baseUrl,
  };

  fs.writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2));

  // Expose the directory so @sally/test-utils auth fixtures can find auth-state.json.
  // Playwright workers inherit this env var from the global-setup process.
  process.env.SALLY_QA_AUTH_STATE_DIR = path.dirname(AUTH_STATE_PATH);

  // Write tenant capabilities for @requires:plan-X test filtering. The super-admin
  // token is already available so we reuse it via a second fetch rather than
  // calling fetchDevUsers again.
  try {
    const caps = await detectCapabilities(baseUrl, tenant.tenantId);
    const capsJson = buildCapabilitiesJson(tenant.tenantId, tenant.tenantName, caps);
    fs.writeFileSync(CAPABILITIES_PATH, JSON.stringify(capsJson, null, 2));
    process.env.SALLY_QA_TENANT_CAPABILITIES_PATH = CAPABILITIES_PATH;
    console.log(`[QA] Tenant capabilities written: ${caps.enabled.size} enabled, ${caps.disabled.size} disabled.`);
  } catch (err) {
    // Non-fatal — capability detection failing should not block the test run.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[QA] Capability detection skipped: ${msg}`);
  }
}
