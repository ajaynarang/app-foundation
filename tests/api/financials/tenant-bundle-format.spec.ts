/**
 * Tenant-level factor bundle format — cleanup phase of the factoring overhaul.
 *
 * Endpoints:
 *   • GET    /tenants/me/settings      — returns `bundleFormat: 'ZIP' | 'MERGED_PDF'`
 *   • PATCH  /tenants/me/bundle-format — ADMIN + OWNER only
 *
 * Background: Phase 2 hardcoded merged-PDF bundles. The cleanup phase makes
 * format a tenant-level setting (default ZIP — safer/universal). See
 * `.docs/plans/03-financials/2026-04-29-factoring-cleanup-design.md`.
 */
import { test, expect } from '@sally/test-utils/auth';
import { z } from 'zod';

const SettingsResponseSchema = z.object({
  bundleFormat: z.enum(['ZIP', 'MERGED_PDF']),
});

const PatchResponseSchema = z.object({
  format: z.enum(['ZIP', 'MERGED_PDF']),
});

test.describe('Tenant bundle format · ZIP/MERGED_PDF · @workflow', () => {
  // Restore default after each test so we don't leak state.
  test.afterEach(async ({ asAdmin }) => {
    await asAdmin.patch('/tenants/me/bundle-format', { format: 'ZIP' }).catch(() => undefined);
  });

  test('PATCH /tenants/me/bundle-format sets MERGED_PDF as ADMIN @destructive', async ({ asAdmin }) => {
    const res = await asAdmin.patch('/tenants/me/bundle-format', { format: 'MERGED_PDF' });
    expect(res.status()).toBe(200);
    const body = PatchResponseSchema.parse(await res.json());
    expect(body.format).toBe('MERGED_PDF');

    // Verify the setting reads back through GET /tenants/me/settings.
    const settingsRes = await asAdmin.get('/tenants/me/settings');
    expect(settingsRes.status()).toBe(200);
    const settings = SettingsResponseSchema.parse(await settingsRes.json());
    expect(settings.bundleFormat).toBe('MERGED_PDF');
  });

  test('PATCH /tenants/me/bundle-format sets ZIP as ADMIN @destructive', async ({ asAdmin }) => {
    // Flip to MERGED_PDF first so the assertion proves the round-trip.
    await asAdmin.patch('/tenants/me/bundle-format', { format: 'MERGED_PDF' });

    const res = await asAdmin.patch('/tenants/me/bundle-format', { format: 'ZIP' });
    expect(res.status()).toBe(200);
    const body = PatchResponseSchema.parse(await res.json());
    expect(body.format).toBe('ZIP');
  });

  test('PATCH /tenants/me/bundle-format forbids DISPATCHER (403)', async ({ asDispatcher }) => {
    const res = await asDispatcher.patch('/tenants/me/bundle-format', { format: 'MERGED_PDF' });
    expect(res.status()).toBe(403);
  });

  test('PATCH /tenants/me/bundle-format forbids DRIVER (403)', async ({ asDriver }) => {
    const res = await asDriver.patch('/tenants/me/bundle-format', { format: 'ZIP' });
    expect(res.status()).toBe(403);
  });

  test('PATCH /tenants/me/bundle-format rejects invalid enum value (400)', async ({ asAdmin }) => {
    const res = await asAdmin.patch('/tenants/me/bundle-format', { format: 'XML' });
    expect(res.status()).toBe(400);
  });

  test('PATCH /tenants/me/bundle-format rejects missing format field (400)', async ({ asAdmin }) => {
    const res = await asAdmin.patch('/tenants/me/bundle-format', {});
    expect(res.status()).toBe(400);
  });

  test('GET /tenants/me/settings includes bundleFormat in the payload', async ({ asDispatcher }) => {
    const res = await asDispatcher.get('/tenants/me/settings');
    expect(res.status()).toBe(200);
    const body = SettingsResponseSchema.parse(await res.json());
    expect(['ZIP', 'MERGED_PDF']).toContain(body.bundleFormat);
  });
});
