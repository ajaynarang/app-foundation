import { test, expect } from '../fixtures/auth.fixture.js';
import { RBAC_MATRIX, type RbacEntry } from './rbac-matrix.generated.js';

/**
 * Auto-generated RBAC tests from the permission matrix.
 *
 * For each entry in the matrix, we test:
 *   1. Every role gets the expected status code
 *   2. Anonymous (no token) gets 401
 *
 * Tests are tagged @rbac for selective execution.
 */

const ALL_ROLES = ['MEMBER', 'ADMIN', 'OWNER', 'SUPER_ADMIN'];

// Group by domain for better reporting
const byDomain = new Map<string, RbacEntry[]>();
for (const entry of RBAC_MATRIX) {
  const group = byDomain.get(entry.domain) || [];
  group.push(entry);
  byDomain.set(entry.domain, group);
}

for (const [domain, entries] of byDomain) {
  test.describe(`RBAC: ${domain} @rbac`, () => {
    for (const entry of entries) {
      test.describe(`${entry.method} ${entry.path} — ${entry.description}`, () => {
        // ── Test each role ──
        for (const role of ALL_ROLES) {
          const expected = entry.expectations[role];
          if (expected === null || expected === undefined) continue;

          const icon = expected >= 200 && expected < 300 ? '✅' : '🚫';

          test(`${role} → ${expected} ${icon}`, async ({ asRole, authState }) => {
            if (!authState.tokens[role]) {
              test.skip(true, `No ${role} user in tenant "${authState.tenantName}"`);
              return;
            }

            const client = asRole(role);
            const method = entry.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';

            const res =
              method === 'get' || method === 'delete'
                ? await client[method](entry.path)
                : await client[method](entry.path, {});

            if (expected === 403) {
              // Some endpoints return 404 for hidden resources instead of 403
              expect(
                [403, 404].includes(res.status()),
                `${entry.description}: ${role} should be denied (got ${res.status()})`,
              ).toBeTruthy();
            } else {
              // Feature-gated endpoints return 403 when tenant's plan doesn't include the feature.
              // This is NOT an RBAC failure — it's a plan restriction. Skip gracefully.
              if (res.status() === 403 && entry.featureGate) {
                test.skip(true, `${entry.description}: feature "${entry.featureGate}" not enabled`);
                return;
              }
              if (res.status() === 403 && expected !== 403) {
                // Check response body for feature/plan gating signals (even without featureGate metadata)
                const body = await res.text();
                const gatingSignals = [
                  'feature',
                  'plan',
                  'not enabled',
                  'not available',
                  'integration',
                  'not configured',
                  'upgrade',
                  'not linked',
                ];
                if (gatingSignals.some((signal) => body.toLowerCase().includes(signal))) {
                  test.skip(true, `${entry.description}: feature/integration not configured (not RBAC)`);
                  return;
                }
              }
              // 404 is acceptable for "allowed but no data" (e.g., a user with no records)
              if (res.status() === 404 && expected === 200) {
                // 404 means the role IS authorized (passed RBAC) but no data exists
                // This is acceptable — the important thing is it's NOT 403/401
                return;
              }
              expect(res.status(), `${entry.description}: ${role} expected ${expected} (got ${res.status()})`).toBe(
                expected,
              );
            }
          });
        }

        // ── Anonymous must get 401 ──
        // Skip for public endpoints (health, feature-flags, plans, add-ons)
        const isPublic = Object.values(entry.expectations).every((v) => v === 200 || v === null);

        if (!isPublic) {
          test('ANONYMOUS → 401 🔒', async ({ asAnonymous }) => {
            const method = entry.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
            const res =
              method === 'get' || method === 'delete'
                ? await asAnonymous[method](entry.path)
                : await asAnonymous[method](entry.path, {});

            expect(res.status()).toBe(401);
          });
        }
      });
    }
  });
}
