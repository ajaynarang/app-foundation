#!/usr/bin/env tsx

/**
 * Lists available tenants from the dev-switcher endpoint.
 * Uses @app/test-utils/auth which enforces the x-dev-auth-secret header.
 *
 * Reads API_BASE_URL from config/test-env.ts (single source of truth).
 * Requires DEV_AUTH_SECRET env var (injected by Doppler locally).
 */
import { fetchDevUsers } from '@app/test-utils/auth';
import { ENV } from '../config/test-env.js';

const baseUrl = ENV.apiBaseUrl;

async function main(): Promise<void> {
  console.log(`\n🔍 Fetching tenants from ${baseUrl}/dev/users ...\n`);

  try {
    const { tenants, superAdmins } = await fetchDevUsers(baseUrl);

    console.log('Available tenants:\n');
    tenants.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.tenantId}`);
      console.log(`     Name:  ${t.tenantName}`);
      console.log(`     Users: ${t.users.length}`);
      t.users.forEach((u) => {
        const identity = u.email || u.phone || 'N/A';
        console.log(`       - ${u.role.padEnd(12)} ${identity} (${u.firstName} ${u.lastName})`);
      });
      console.log('');
    });

    console.log(`Super Admins: ${superAdmins.length}`);
    superAdmins.forEach((sa) => {
      console.log(`  - ${sa.email} (${sa.firstName} ${sa.lastName})`);
    });

    console.log(`\nUsage: TENANT_ID=<id> pnpm test:qa:local\n`);
  } catch (err) {
    console.error(`❌ Failed to fetch ${baseUrl}/dev/users`);
    console.error(`   ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
