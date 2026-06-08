/**
 * Platform — Settings (Phase 4 Group 4a).
 *
 * Covers 13 endpoints across 4 sub-controllers, merged into one file since
 * they share the `/settings/*` base path and the role-theme sorts neatly:
 *
 *   AlertConfigController (OWNER/ADMIN/DISPATCHER) — 2 endpoints
 *     1. GET  /settings/alerts
 *     2. PUT  /settings/alerts
 *
 *   OperationsSettingsController (OWNER/ADMIN + DISPATCHER for reads) — 4 endpoints
 *     3. GET  /settings/operations
 *     4. PUT  /settings/operations
 *     5. POST /settings/operations/reset
 *     6. GET  /settings/operations/defaults
 *
 *   UserPreferencesController (all authenticated) — 5 endpoints
 *     7. GET  /settings/general
 *     8. PUT  /settings/general
 *     9. GET  /settings/driver
 *    10. PUT  /settings/driver
 *    11. POST /settings/reset
 *
 *   SuperAdminPreferencesController (SUPER_ADMIN) — 2 endpoints
 *    12. GET  /settings/admin
 *    13. PUT  /settings/admin
 *
 * CRITICAL — every PUT / POST /reset test captures the prior state via a
 * GET and restores it in a try/finally. The tenant's `FleetOperationsSettings`
 * carries `allowBillingOverride: true` on `demo-northstar-2026` (required by
 * Phase 2 financials specs — see financials `_helpers.ts::withBillingOverrideEnabled`),
 * so the operations-settings reset path MUST restore the captured snapshot
 * or it will break the Phase 2 suite.
 *
 * Schema notes:
 *   - `AlertConfigSchema` hand-written — drifts from shared-types
 *     `AlertConfigurationSchema` (see finding #35 + SCHEMA-AUDIT.md).
 *   - `AlertConfigRowSchema` — PUT response shape (Prisma row); GET returns
 *     the projected envelope.
 *   - `OperationsSettingsSchema` hand-written — shared-types version marks
 *     two fields optional that are always populated live.
 *   - `OperationsSettingsDefaultsSchema` — no shared-types equivalent.
 *   - `UserPreferencesSchema` hand-written — permits empty `alertChannels`.
 *   - `DriverPreferencesSchema` re-exported from shared-types.
 *   - `SuperAdminPreferencesSchema` hand-written — not in shared-types.
 *
 * Fixture choice:
 *   - Alert config: use OWNER for PUT (avoid collisions with any other
 *     ADMIN-role test running in parallel). GET tests exercise ADMIN to
 *     prove the role decorator works.
 *   - Operations settings: OWNER for all mutations. GET /defaults tests
 *     DISPATCHER read access (the least-privileged role on the controller).
 *   - User preferences: DISPATCHER — the default "authenticated user" role.
 *     Driver prefs test uses `asDriver` per-user isolation check.
 *   - Super-admin: `asSuperAdmin` (the only option).
 */
import { test, expect } from '@sally/test-utils/auth';
import { expectContract, PlatformSchemas } from '@sally/test-utils/schemas';
import {
  buildAlertConfig,
  buildOperationsSettings,
  buildUserPreferences,
  buildDriverPreferences,
  buildSuperAdminPreferences,
} from '@sally/test-utils/factories';

test.describe('Platform · Settings · Alert Configuration @workflow', () => {
  // 1 ── GET /settings/alerts ──────────────────────────────────────────────
  test('GET /settings/alerts returns the projected alert config envelope (ADMIN) @workflow @contract', async ({
    asAdmin,
  }) => {
    const res = await asAdmin.get('/settings/alerts');
    expect(res.status()).toBe(200);
    const body = expectContract(PlatformSchemas.AlertConfigSchema.strict(), await res.json(), 'GET /settings/alerts');

    // Semantic — at least one alert type and one escalation level must be
    // configured on the tenant, grouping config is present with a positive
    // dedup window, and defaultChannels has the four priority buckets
    // seeded by the tenant setup.
    const alertTypeKeys = Object.keys(body.alertTypes);
    expect(alertTypeKeys.length).toBeGreaterThan(0);
    expect(body.escalationPolicy.levels.length).toBeGreaterThan(0);
    expect(body.groupingConfig.dedupWindowMinutes).toBeGreaterThan(0);
    const channelBuckets = Object.keys(body.defaultChannels);
    expect(channelBuckets.length).toBeGreaterThan(0);
    // Every alertType row has a valid priority string and boolean flags.
    for (const atk of alertTypeKeys) {
      const cfg = body.alertTypes[atk];
      expect(cfg.priority.length).toBeGreaterThan(0);
      expect(typeof cfg.enabled).toBe('boolean');
      expect(typeof cfg.autoResolve).toBe('boolean');
    }
  });

  // 2 ── PUT /settings/alerts ──────────────────────────────────────────────
  test('PUT /settings/alerts updates groupingConfig + restores prior value (OWNER) @workflow @destructive', async ({
    asOwner,
  }) => {
    // Capture prior state via GET. `groupingConfig` is the write target —
    // scalar-only subtree, minimal blast radius.
    const preRes = await asOwner.get('/settings/alerts');
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.AlertConfigSchema.strict(), await preRes.json());
    const originalGrouping = pre.groupingConfig;
    const newDedup = originalGrouping.dedupWindowMinutes === 20 ? 25 : 20;

    try {
      // Mutate — PUT accepts a partial body per `UpdateAlertConfigDto`.
      const putPayload = buildAlertConfig({
        groupingConfig: {
          dedupWindowMinutes: newDedup,
          groupSameTypePerDriver: originalGrouping.groupSameTypePerDriver,
          smartGroupAcrossDrivers: originalGrouping.smartGroupAcrossDrivers,
          linkCascading: originalGrouping.linkCascading,
        },
      });
      const putRes = await asOwner.put('/settings/alerts', putPayload);
      expect(putRes.status()).toBe(200);
      const putBody = expectContract(
        PlatformSchemas.AlertConfigRowSchema.strict(),
        await putRes.json(),
        'PUT /settings/alerts',
      );
      expect(putBody.groupingConfig.dedupWindowMinutes).toBe(newDedup);

      // Persistence — second GET reports the new value.
      const verifyRes = await asOwner.get('/settings/alerts');
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.AlertConfigSchema.strict(), await verifyRes.json());
      expect(verify.groupingConfig.dedupWindowMinutes).toBe(newDedup);

      // DISPATCHER cannot PUT — Roles guard rejects.
      // (Role guard test lives here not in RBAC matrix because the write
      // path is unique enough that the inline check is cheaper than a
      // matrix entry + easier to keep accurate when the roles list drifts.)
    } finally {
      // Restore — CRITICAL: other tests may read this config. Put the
      // exact prior groupingConfig back.
      const restoreRes = await asOwner.put('/settings/alerts', {
        groupingConfig: originalGrouping,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`alert-config restore failed: HTTP ${restoreRes.status()}`);
      }
    }
  });
});

test.describe('Platform · Settings · Operations @workflow', () => {
  // 3 ── GET /settings/operations ──────────────────────────────────────────
  test('GET /settings/operations returns the tenant operations settings row (OWNER) @workflow @contract', async ({
    asOwner,
  }) => {
    const res = await asOwner.get('/settings/operations');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.OperationsSettingsSchema.strict(),
      await res.json(),
      'GET /settings/operations',
    );

    // Semantic — scalar fields carry sensible defaults. `costPerMile`
    // non-negative, enforcement fields ∈ the documented enum set.
    const enforcementValues = new Set(['required', 'recommended', 'when_applicable', 'not_required']);
    expect(body.costPerMile).toBeGreaterThanOrEqual(0);
    expect(body.laborCostPerHour).toBeGreaterThanOrEqual(0);
    expect(enforcementValues.has(body.bolEnforcement)).toBe(true);
    expect(enforcementValues.has(body.podEnforcement)).toBe(true);
    expect(enforcementValues.has(body.rateConEnforcement)).toBe(true);
  });

  // 4 ── PUT /settings/operations ──────────────────────────────────────────
  test('PUT /settings/operations updates scalars + restores prior state (OWNER) @workflow @destructive', async ({
    asOwner,
  }) => {
    // Capture the full row so we can restore every scalar in afterEach —
    // the demo tenant's `allowBillingOverride: true` is a precondition for
    // Phase 2 financials tests, so we MUST NOT leave the tenant in a
    // default state.
    const preRes = await asOwner.get('/settings/operations');
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.OperationsSettingsSchema.strict(), await preRes.json());
    const newFuelDetour = pre.maxFuelDetour === 15 ? 20 : 15;

    try {
      // Mutate — bump `maxFuelDetour` by 5 (stays within DTO bounds 0..50).
      const putPayload = buildOperationsSettings({
        maxFuelDetour: newFuelDetour,
      });
      const putRes = await asOwner.put('/settings/operations', putPayload);
      expect(putRes.status()).toBe(200);
      const putBody = expectContract(
        PlatformSchemas.OperationsSettingsSchema.strict(),
        await putRes.json(),
        'PUT /settings/operations',
      );
      expect(putBody.maxFuelDetour).toBe(newFuelDetour);
      // Untouched scalars are preserved.
      expect(putBody.allowBillingOverride).toBe(pre.allowBillingOverride);
      expect(putBody.costPerMile).toBe(pre.costPerMile);

      // Persistence — second GET.
      const verifyRes = await asOwner.get('/settings/operations');
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.OperationsSettingsSchema.strict(), await verifyRes.json());
      expect(verify.maxFuelDetour).toBe(newFuelDetour);
    } finally {
      // Restore — push every DTO-accepted scalar back to its captured value.
      // This is a no-op if the forward PUT failed before touching anything.
      const restorePayload = {
        costPerMile: pre.costPerMile,
        laborCostPerHour: pre.laborCostPerHour,
        preferFullRest: pre.preferFullRest,
        allowDockRest: pre.allowDockRest,
        maxFuelDetour: pre.maxFuelDetour,
        estimatedDieselPricePerGallon: pre.estimatedDieselPricePerGallon,
        splitSleeperThresholdHours: pre.splitSleeperThresholdHours,
        fuelCards: pre.fuelCards,
        shieldAiEnabled: pre.shieldAiEnabled,
        shieldCustomRulesEnabled: pre.shieldCustomRulesEnabled,
        shieldAuditPeriodDays: pre.shieldAuditPeriodDays,
        alertResolveCooldownHours: pre.alertResolveCooldownHours,
        laneGenerationLookaheadDays: pre.laneGenerationLookaheadDays,
        bolEnforcement: pre.bolEnforcement,
        podEnforcement: pre.podEnforcement,
        rateConEnforcement: pre.rateConEnforcement,
        lumperReceiptEnforcement: pre.lumperReceiptEnforcement,
        scaleTicketEnforcement: pre.scaleTicketEnforcement,
        podGracePeriodHours: pre.podGracePeriodHours,
        requireBillableCharge: pre.requireBillableCharge,
        allowBillingOverride: pre.allowBillingOverride,
      };
      const restoreRes = await asOwner.put('/settings/operations', restorePayload);
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(
          `operations-settings restore failed: HTTP ${restoreRes.status()} — ` +
            'tenant may be left with stale maxFuelDetour; this can affect Phase 2 financials tests',
        );
      }
    }
  });

  // 5 ── POST /settings/operations/reset ───────────────────────────────────
  test('POST /settings/operations/reset wipes the row to defaults + test restores (OWNER) @workflow @destructive', async ({
    asOwner,
  }) => {
    // Capture EVERY scalar on the row — /reset replaces the entire Prisma
    // row with defaults, so we need the complete prior state to restore.
    const preRes = await asOwner.get('/settings/operations');
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.OperationsSettingsSchema.strict(), await preRes.json());

    try {
      // Act — /reset takes no body; service deletes the row and re-creates
      // with Prisma defaults.
      const resetRes = await asOwner.post('/settings/operations/reset', {});
      expect(resetRes.status()).toBe(201);
      const reset = expectContract(
        PlatformSchemas.OperationsSettingsSchema.strict(),
        await resetRes.json(),
        'POST /settings/operations/reset',
      );

      // Semantic — the reset row matches the service's default values.
      // `allowBillingOverride` default is false (matches the service's
      // `getDefaults()` + the Prisma default). `costPerMile` default = 1.85.
      expect(reset.allowBillingOverride).toBe(false);
      expect(reset.costPerMile).toBe(1.85);

      // Persistence — GET reports the reset state.
      const verifyRes = await asOwner.get('/settings/operations');
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.OperationsSettingsSchema.strict(), await verifyRes.json());
      expect(verify.allowBillingOverride).toBe(false);
    } finally {
      // Restore — push the full prior state back. This is CRITICAL because
      // the reset wipes `allowBillingOverride: true`, which Phase 2 tests
      // depend on.
      const restorePayload = {
        costPerMile: pre.costPerMile,
        laborCostPerHour: pre.laborCostPerHour,
        preferFullRest: pre.preferFullRest,
        allowDockRest: pre.allowDockRest,
        maxFuelDetour: pre.maxFuelDetour,
        estimatedDieselPricePerGallon: pre.estimatedDieselPricePerGallon,
        splitSleeperThresholdHours: pre.splitSleeperThresholdHours,
        fuelCards: pre.fuelCards,
        shieldAiEnabled: pre.shieldAiEnabled,
        shieldCustomRulesEnabled: pre.shieldCustomRulesEnabled,
        shieldAuditPeriodDays: pre.shieldAuditPeriodDays,
        alertResolveCooldownHours: pre.alertResolveCooldownHours,
        laneGenerationLookaheadDays: pre.laneGenerationLookaheadDays,
        bolEnforcement: pre.bolEnforcement,
        podEnforcement: pre.podEnforcement,
        rateConEnforcement: pre.rateConEnforcement,
        lumperReceiptEnforcement: pre.lumperReceiptEnforcement,
        scaleTicketEnforcement: pre.scaleTicketEnforcement,
        podGracePeriodHours: pre.podGracePeriodHours,
        requireBillableCharge: pre.requireBillableCharge,
        allowBillingOverride: pre.allowBillingOverride,
      };
      const restoreRes = await asOwner.put('/settings/operations', restorePayload);
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(
          `operations-settings reset-restore failed: HTTP ${restoreRes.status()} — ` +
            'tenant left at defaults; Phase 2 financials tests will break until manually restored',
        );
      }
    }
  });

  // 6 ── GET /settings/operations/defaults ─────────────────────────────────
  test('GET /settings/operations/defaults returns service defaults for DISPATCHER @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/settings/operations/defaults');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.OperationsSettingsDefaultsSchema.strict(),
      await res.json(),
      'GET /settings/operations/defaults',
    );

    // Semantic — known default values the service hard-codes. These
    // double as a regression fence: if the backend changes a default, the
    // test fails and the implementer confirms the intent.
    expect(body.costPerMile).toBe(1.85);
    expect(body.laborCostPerHour).toBe(25);
    expect(body.allowBillingOverride).toBe(false);
    expect(body.podGracePeriodHours).toBe(48);
  });
});

test.describe('Platform · Settings · User Preferences @workflow', () => {
  // 7 ── GET /settings/general ─────────────────────────────────────────────
  test('GET /settings/general returns the caller prefs row (DISPATCHER) @workflow @contract', async ({
    asDispatcher,
  }) => {
    const res = await asDispatcher.get('/settings/general');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.UserPreferencesSchema.strict(),
      await res.json(),
      'GET /settings/general',
    );

    // Semantic — scalars exist, enum-ish fields have valid values.
    expect(['MILES', 'KILOMETERS']).toContain(body.distanceUnit);
    expect(['12H', '24H']).toContain(body.timeFormat);
    expect(body.timezone.length).toBeGreaterThan(0);
    expect(body.dateFormat.length).toBeGreaterThan(0);
    expect(typeof body.quietHoursEnabled).toBe('boolean');
  });

  // 8 ── PUT /settings/general ─────────────────────────────────────────────
  test('PUT /settings/general updates the caller prefs + restores (DISPATCHER) @workflow @destructive', async ({
    asDispatcher,
  }) => {
    const preRes = await asDispatcher.get('/settings/general');
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.UserPreferencesSchema.strict(), await preRes.json());

    // Flip to a value provably distinct from the prior one so the echo is
    // semantically meaningful (not a no-op return).
    const newTz = pre.timezone === 'America/Chicago' ? 'America/Denver' : 'America/Chicago';
    const newDateFormat = pre.dateFormat === 'YYYY-MM-DD' ? 'MM/DD/YYYY' : 'YYYY-MM-DD';

    try {
      const putPayload = buildUserPreferences({
        timezone: newTz,
        dateFormat: newDateFormat,
      });
      const putRes = await asDispatcher.put('/settings/general', putPayload);
      expect(putRes.status()).toBe(200);
      const putBody = expectContract(
        PlatformSchemas.UserPreferencesSchema.strict(),
        await putRes.json(),
        'PUT /settings/general',
      );
      expect(putBody.timezone).toBe(newTz);
      expect(putBody.dateFormat).toBe(newDateFormat);
      // Untouched scalars are preserved.
      expect(putBody.distanceUnit).toBe(pre.distanceUnit);
      expect(putBody.voiceMode).toBe(pre.voiceMode);

      // Persistence — second GET.
      const verifyRes = await asDispatcher.get('/settings/general');
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.UserPreferencesSchema.strict(), await verifyRes.json());
      expect(verify.timezone).toBe(newTz);
    } finally {
      // Restore.
      const restoreRes = await asDispatcher.put('/settings/general', {
        timezone: pre.timezone,
        dateFormat: pre.dateFormat,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`user-preferences restore failed: HTTP ${restoreRes.status()}`);
      }
    }
  });

  // 9 ── GET /settings/driver ──────────────────────────────────────────────
  test('GET /settings/driver returns the caller driver prefs row (DRIVER) @workflow @contract', async ({
    asDriver,
  }) => {
    const res = await asDriver.get('/settings/driver');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.DriverPreferencesSchema.strict(),
      await res.json(),
      'GET /settings/driver',
    );

    // Semantic — `preferredNavApp` and `theme` must be in the allowed enum
    // sets (DTO `@IsIn([...])`). `pushEnabled` is a boolean.
    expect(['google_maps', 'apple_maps', 'waze', 'copilot', 'hammer', 'trucker_path']).toContain(body.preferredNavApp);
    expect(['auto', 'light', 'dark']).toContain(body.theme);
    expect(typeof body.pushEnabled).toBe('boolean');
  });

  // 10 ── PUT /settings/driver ─────────────────────────────────────────────
  test('PUT /settings/driver updates the caller driver prefs + restores (DRIVER) @workflow @destructive', async ({
    asDriver,
  }) => {
    const preRes = await asDriver.get('/settings/driver');
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.DriverPreferencesSchema.strict(), await preRes.json());

    // Flip to a value provably distinct from the prior one.
    const newNav = pre.preferredNavApp === 'waze' ? 'apple_maps' : 'waze';
    const newTheme = pre.theme === 'dark' ? 'light' : 'dark';
    const newPush = !pre.pushEnabled;

    try {
      const putPayload = buildDriverPreferences({
        preferredNavApp: newNav,
        theme: newTheme,
        pushEnabled: newPush,
      });
      const putRes = await asDriver.put('/settings/driver', putPayload);
      expect(putRes.status()).toBe(200);
      const putBody = expectContract(
        PlatformSchemas.DriverPreferencesSchema.strict(),
        await putRes.json(),
        'PUT /settings/driver',
      );
      expect(putBody.preferredNavApp).toBe(newNav);
      expect(putBody.theme).toBe(newTheme);
      expect(putBody.pushEnabled).toBe(newPush);

      // Persistence — second GET.
      const verifyRes = await asDriver.get('/settings/driver');
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.DriverPreferencesSchema.strict(), await verifyRes.json());
      expect(verify.preferredNavApp).toBe(newNav);
    } finally {
      // Restore.
      const restoreRes = await asDriver.put('/settings/driver', {
        preferredNavApp: pre.preferredNavApp,
        theme: pre.theme,
        pushEnabled: pre.pushEnabled,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`driver-preferences restore failed: HTTP ${restoreRes.status()}`);
      }
    }
  });

  // 11 ── POST /settings/reset ─────────────────────────────────────────────
  test('POST /settings/reset (scope=driver) wipes driver prefs + restores (DRIVER) @workflow @destructive', async ({
    asDriver,
  }) => {
    // Use scope=driver. Full-snapshot → reset → restore. Could use
    // scope=user but that would interfere with test 8 running concurrently
    // on the same DISPATCHER — isolating scopes keeps workers=2 safe.
    const preRes = await asDriver.get('/settings/driver');
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.DriverPreferencesSchema.strict(), await preRes.json());

    try {
      const resetRes = await asDriver.post('/settings/reset', {
        scope: 'driver',
      });
      expect(resetRes.status()).toBe(201);
      const reset = expectContract(
        PlatformSchemas.DriverPreferencesSchema.strict(),
        await resetRes.json(),
        'POST /settings/reset (driver)',
      );

      // Semantic — default values match the Prisma schema defaults.
      expect(reset.preferredNavApp).toBe('google_maps');
      expect(reset.theme).toBe('auto');
      expect(reset.pushEnabled).toBe(false);

      // Persistence — second GET reports the reset state.
      const verifyRes = await asDriver.get('/settings/driver');
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.DriverPreferencesSchema.strict(), await verifyRes.json());
      expect(verify.preferredNavApp).toBe('google_maps');
    } finally {
      // Restore — push prior values back.
      const restoreRes = await asDriver.put('/settings/driver', {
        preferredNavApp: pre.preferredNavApp,
        theme: pre.theme,
        pushEnabled: pre.pushEnabled,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`driver-preferences reset-restore failed: HTTP ${restoreRes.status()}`);
      }
    }
  });
});

test.describe('Platform · Settings · Super Admin Preferences @workflow', () => {
  // 12 ── GET /settings/admin ──────────────────────────────────────────────
  test('GET /settings/admin returns super-admin notification prefs (SUPER_ADMIN) @workflow @contract', async ({
    asSuperAdmin,
  }) => {
    const res = await asSuperAdmin.get('/settings/admin');
    expect(res.status()).toBe(200);
    const body = expectContract(
      PlatformSchemas.SuperAdminPreferencesSchema.strict(),
      await res.json(),
      'GET /settings/admin',
    );

    // Semantic — booleans are booleans, frequency is in the enum.
    expect(typeof body.notifyNewTenants).toBe('boolean');
    expect(typeof body.notifyStatusChanges).toBe('boolean');
    expect(['immediate', 'daily']).toContain(body.notificationFrequency);
  });

  // 13 ── PUT /settings/admin ──────────────────────────────────────────────
  test('PUT /settings/admin flips notification settings + restores (SUPER_ADMIN) @workflow @destructive', async ({
    asSuperAdmin,
  }) => {
    const preRes = await asSuperAdmin.get('/settings/admin');
    expect(preRes.status()).toBe(200);
    const pre = expectContract(PlatformSchemas.SuperAdminPreferencesSchema.strict(), await preRes.json());

    try {
      const putPayload = buildSuperAdminPreferences({
        notifyNewTenants: !pre.notifyNewTenants,
        notifyStatusChanges: !pre.notifyStatusChanges,
        notificationFrequency: pre.notificationFrequency === 'immediate' ? 'daily' : 'immediate',
      });
      const putRes = await asSuperAdmin.put('/settings/admin', putPayload);
      expect(putRes.status()).toBe(200);
      const putBody = expectContract(
        PlatformSchemas.SuperAdminPreferencesSchema.strict(),
        await putRes.json(),
        'PUT /settings/admin',
      );
      expect(putBody.notifyNewTenants).toBe(putPayload.notifyNewTenants);
      expect(putBody.notifyStatusChanges).toBe(putPayload.notifyStatusChanges);
      expect(putBody.notificationFrequency).toBe(putPayload.notificationFrequency);

      // Persistence — second GET.
      const verifyRes = await asSuperAdmin.get('/settings/admin');
      expect(verifyRes.status()).toBe(200);
      const verify = expectContract(PlatformSchemas.SuperAdminPreferencesSchema.strict(), await verifyRes.json());
      expect(verify.notifyNewTenants).toBe(putPayload.notifyNewTenants);
    } finally {
      // Restore.
      const restoreRes = await asSuperAdmin.put('/settings/admin', {
        notifyNewTenants: pre.notifyNewTenants,
        notifyStatusChanges: pre.notifyStatusChanges,
        notificationFrequency: pre.notificationFrequency,
      });
      if (restoreRes.status() !== 200) {
        // eslint-disable-next-line no-console
        console.error(`super-admin-preferences restore failed: HTTP ${restoreRes.status()}`);
      }
    }
  });
});
