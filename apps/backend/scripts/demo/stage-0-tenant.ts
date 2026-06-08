/**
 * Stage 0 — Tenant, Firebase Users, Tenant Configuration
 *
 * Creates:
 * 1. Demo tenant (Northstar Logistics)
 * 2. FleetOperationsSettings
 * 3. AlertConfiguration
 * 4. InvoiceSettings
 * 5. IntegrationConfig for Samsara ELD
 * 6. Firebase users + DB user records
 */
import { PrismaClient } from '@prisma/client';
import {
  DEMO_TENANT_ID,
  DEMO_TENANT_NAME,
  DEMO_TENANT_SLUG,
  DEMO_PLAN,
  DEMO_PASSWORD,
  DEMO_EMAIL_DOMAIN,
  DEMO_USERS,
} from './config';
import { DemoLogger } from './helpers/logger';
import { initFirebase, createFirebaseUser, deleteFirebaseUser } from './helpers/firebase';
import { runReset } from '../tenant-reset';

// ---------------------------------------------------------------------------
// run() — Create everything
// ---------------------------------------------------------------------------

export async function run(prisma: PrismaClient, logger: DemoLogger): Promise<void> {
  // 1. Create or find tenant
  let tenant = await prisma.tenant.findUnique({
    where: { tenantId: DEMO_TENANT_ID },
  });

  if (tenant) {
    logger.item('Tenant', DEMO_TENANT_NAME, 'skip');
  } else {
    tenant = await prisma.tenant.create({
      data: {
        tenantId: DEMO_TENANT_ID,
        companyName: DEMO_TENANT_NAME,
        subdomain: DEMO_TENANT_SLUG,
        contactEmail: `admin@${DEMO_EMAIL_DOMAIN}`,
        contactPhone: '(617) 555-0100',
        status: 'ACTIVE',
        dotNumber: '3847291',
        mcNumber: '1284756',
        carrierType: 'FOR_HIRE_INTERSTATE',
        fleetSize: 'SIZE_11_50',
        isActive: true,
        plan: DEMO_PLAN,
        approvedAt: new Date(),
        approvedBy: 'demo-seed',
        onboardingCompletedAt: new Date(),
        planAssignedAt: new Date(),
        planAssignedBy: 'demo-seed',
      },
    });
    logger.item('Tenant', DEMO_TENANT_NAME, 'create');
  }

  const tenantIntId = tenant.id;

  // 2. FleetOperationsSettings
  const existingFos = await prisma.fleetOperationsSettings.findUnique({
    where: { tenantId: tenantIntId },
  });
  if (existingFos) {
    logger.item('Fleet Ops Settings', 'exists', 'skip');
  } else {
    await prisma.fleetOperationsSettings.create({
      data: {
        tenantId: tenantIntId,
        costPerMile: 1.85,
        laborCostPerHour: 28.0,
        preferFullRest: true,
        allowDockRest: true,
        shieldAiEnabled: true,
        shieldCustomRulesEnabled: true,
        shieldAuditPeriodDays: 30,
        alertResolveCooldownHours: 4,
        bolEnforcement: 'required',
        podEnforcement: 'required',
        rateConEnforcement: 'recommended',
        requireBillableCharge: true,
      },
    });
    logger.item('Fleet Ops Settings', 'HOS defaults + Shield enabled', 'create');
  }

  // 3. AlertConfiguration
  const existingAc = await prisma.alertConfiguration.findUnique({
    where: { tenantId: tenantIntId },
  });
  if (existingAc) {
    logger.item('Alert Configuration', 'exists', 'skip');
  } else {
    await prisma.alertConfiguration.create({
      data: {
        tenantId: tenantIntId,
        alertTypes: {
          hosViolation: {
            enabled: true,
            priority: 'critical',
            autoResolve: false,
          },
          dvirDefect: { enabled: true, priority: 'high', autoResolve: false },
          latePickup: { enabled: true, priority: 'high', autoResolve: true },
          lateDelivery: { enabled: true, priority: 'high', autoResolve: true },
          geofenceDeviation: {
            enabled: true,
            priority: 'medium',
            autoResolve: true,
          },
          documentMissing: {
            enabled: true,
            priority: 'medium',
            autoResolve: false,
          },
        },
        escalationPolicy: {
          levels: [
            { delayMinutes: 0, notifyRoles: ['DISPATCHER'] },
            { delayMinutes: 30, notifyRoles: ['DISPATCHER', 'ADMIN'] },
            { delayMinutes: 120, notifyRoles: ['DISPATCHER', 'ADMIN'] },
          ],
        },
        groupingConfig: {
          dedupWindowMinutes: 15,
          groupSameTypePerDriver: true,
          smartGroupAcrossDrivers: true,
          linkCascading: true,
        },
        defaultChannels: {
          critical: { inApp: true, email: true, push: true },
          high: { inApp: true, email: true, push: false },
          medium: { inApp: true, email: false, push: false },
          low: { inApp: true, email: false, push: false },
        },
      },
    });
    logger.item('Alert Configuration', '6 alert types + escalation', 'create');
  }

  // 4. InvoiceSettings
  const existingIs = await prisma.invoiceSettings.findUnique({
    where: { tenantId: tenantIntId },
  });
  if (existingIs) {
    logger.item('Invoice Settings', 'exists', 'skip');
  } else {
    await prisma.invoiceSettings.create({
      data: {
        tenantId: tenantIntId,
        companyLegalName: 'Northstar Logistics LLC',
        address: '100 Commercial Wharf',
        city: 'Boston',
        state: 'MA',
        zip: '02110',
        phone: '(617) 555-0100',
        email: `billing@${DEMO_EMAIL_DOMAIN}`,
        mcNumber: 'MC-1284756',
        dotNumber: 'DOT-3847291',
        defaultPaymentTermsDays: 30,
        remittanceInstructions:
          'Wire to: Northstar Logistics LLC\nBank: First National Bank\nRouting: 021000021\nAccount: ****4829',
        acceptedPaymentMethods: 'ACH, Wire, Check',
        invoicePrefix: 'NL-INV',
        defaultNotes: 'Thank you for your business.',
        termsAndConditions: 'Payment due within specified terms. Late payments subject to 1.5% monthly interest.',
      },
    });
    logger.item('Invoice Settings', 'NL-INV prefix + branding', 'create');
  }

  // 5. IntegrationConfig for Samsara ELD
  const existingInteg = await prisma.integrationConfig.findFirst({
    where: {
      tenantId: tenantIntId,
      integrationType: 'ELD',
      vendor: 'SAMSARA_ELD',
    },
  });
  if (existingInteg) {
    logger.item('Integration Config', 'Samsara ELD exists', 'skip');
  } else {
    await prisma.integrationConfig.create({
      data: {
        integrationId: `integ_${DEMO_TENANT_ID}_samsara`,
        tenantId: tenantIntId,
        integrationType: 'ELD',
        vendor: 'SAMSARA_ELD',
        displayName: 'Samsara ELD',
        isEnabled: false,
        status: 'NOT_CONFIGURED',
        syncIntervalSeconds: 300,
      },
    });
    logger.item('Integration Config', 'Samsara ELD (NOT_CONFIGURED)', 'create');
  }

  // 5.5 JobSchedule records (global, not per-tenant — upsert to ensure they exist)
  const jobSchedules = [
    // Integration-scoped: TMS
    {
      category: 'tms',
      jobType: 'drivers',
      scheduleType: 'cron',
      pattern: '*/30 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'tms',
      jobType: 'vehicles',
      scheduleType: 'cron',
      pattern: '*/30 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'tms',
      jobType: 'loads',
      scheduleType: 'cron',
      pattern: '*/15 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    // Integration-scoped: ELD
    {
      category: 'eld',
      jobType: 'hos',
      scheduleType: 'cron',
      pattern: '*/15 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'eld',
      jobType: 'gps',
      scheduleType: 'interval',
      pattern: null,
      intervalMs: 300000,
      isEnabled: true,
    },
    {
      category: 'eld',
      jobType: 'dvir',
      scheduleType: 'cron',
      pattern: '0 3 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'eld',
      jobType: 'fleet-sync',
      scheduleType: 'cron',
      pattern: '0 3 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    // System-wide: Compliance
    {
      category: 'compliance',
      jobType: 'audit',
      scheduleType: 'cron',
      // Hourly wake; the cron fan-out runs each tenant's audit at their local 8 AM
      // (DIGEST_LOCAL_HOUR), idempotent via Tenant.lastAuditRunDate.
      pattern: '0 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    // System-wide: Maintenance
    {
      category: 'maintenance',
      jobType: 'login-events',
      scheduleType: 'cron',
      pattern: '0 2 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'maintenance',
      jobType: 'tokens',
      scheduleType: 'cron',
      pattern: '0 2 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'maintenance',
      jobType: 'uploads',
      scheduleType: 'cron',
      pattern: '0 */6 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'maintenance',
      jobType: 'trial-expiry',
      scheduleType: 'cron',
      pattern: '0 2 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      // Category must match the module's lookup (add-ons.module.ts reads
      // category 'finance') — the queue refactor moved this job to the finance
      // queue, so the schedule row lives under 'finance', not 'maintenance'.
      category: 'finance',
      jobType: 'addon-usage-reset',
      scheduleType: 'cron',
      // Daily wake; the job resets each tenant only on its local 1st-of-month,
      // idempotent via TenantAddOn.usageResetAt.
      pattern: '0 1 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'maintenance',
      jobType: 'job-cleanup',
      scheduleType: 'cron',
      pattern: '0 3 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'maintenance',
      jobType: 'data-retention',
      scheduleType: 'cron',
      pattern: '0 4 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    // System-wide: Lanes
    {
      category: 'lanes',
      jobType: 'auto-generation',
      scheduleType: 'cron',
      pattern: '0 5 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    // System-wide: Notifications
    {
      category: 'notifications',
      jobType: 'cleanup',
      scheduleType: 'cron',
      pattern: '0 3 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'notifications',
      jobType: 'document-expiry',
      scheduleType: 'cron',
      pattern: '0 6 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'notifications',
      jobType: 'invoice-overdue',
      scheduleType: 'cron',
      pattern: '0 7 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    // System-wide: Operations (formerly @Cron decorators)
    {
      category: 'operations',
      jobType: 'alert-escalation',
      scheduleType: 'cron',
      pattern: '* * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'operations',
      jobType: 'alert-unsnooze',
      scheduleType: 'cron',
      pattern: '* * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'operations',
      jobType: 'alert-digest',
      scheduleType: 'cron',
      // Hourly wake; the job fires per tenant at their local 8 AM (DIGEST_LOCAL_HOUR),
      // idempotent via Tenant.lastDigestRunDate.
      pattern: '0 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'operations',
      jobType: 'shift-summary',
      scheduleType: 'cron',
      pattern: '0 6,18 * * *',
      intervalMs: null,
      isEnabled: true,
    },
    {
      category: 'operations',
      jobType: 'load-monitoring',
      scheduleType: 'cron',
      pattern: '*/2 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
    // System-wide: Routing (formerly @Cron in RoutePlanProgressScheduler)
    {
      category: 'routing',
      jobType: 'route-progress',
      scheduleType: 'cron',
      pattern: '*/2 * * * *',
      intervalMs: null,
      isEnabled: true,
    },
  ];

  for (const schedule of jobSchedules) {
    const existing = await prisma.jobSchedule.findUnique({
      where: {
        category_jobType: {
          category: schedule.category,
          jobType: schedule.jobType,
        },
      },
    });
    if (existing) {
      logger.item(`JobSchedule: ${schedule.category}/${schedule.jobType}`, 'exists', 'skip');
    } else {
      await prisma.jobSchedule.create({
        data: {
          category: schedule.category,
          jobType: schedule.jobType,
          scheduleType: schedule.scheduleType,
          pattern: schedule.pattern,
          intervalMs: schedule.intervalMs,
          isEnabled: schedule.isEnabled,
        },
      });
      logger.item(
        `JobSchedule: ${schedule.category}/${schedule.jobType}`,
        schedule.pattern || `${schedule.intervalMs}ms` || 'manual',
        'create',
      );
    }
  }

  // 6. Firebase users + DB user records
  initFirebase();

  for (const demoUser of DEMO_USERS) {
    const nameParts = demoUser.name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    const userId = `user_demo_${demoUser.email.split('@')[0].replace(/[^a-z0-9]/g, '_')}`;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: demoUser.email },
    });

    if (existingUser) {
      logger.item(`User: ${demoUser.name}`, demoUser.email, 'skip');
      continue;
    }

    // Create Firebase user (may return null if Firebase not configured)
    const firebaseUid = await createFirebaseUser(demoUser.email, DEMO_PASSWORD, demoUser.name);

    // Create DB user
    const user = await prisma.user.create({
      data: {
        userId,
        email: demoUser.email,
        firstName,
        lastName,
        role: demoUser.role,
        tenantId: tenantIntId,
        firebaseUid,
        isActive: true,
        emailVerified: true,
      },
    });

    // Create user preferences
    await prisma.userPreferences.create({
      data: {
        userId: user.id,
        timezone: 'America/New_York',
        dateFormat: 'MM/DD/YYYY',
        distanceUnit: 'MILES',
        timeFormat: '12H',
      },
    });

    const authStatus = firebaseUid ? 'Firebase + DB' : 'DB only';
    logger.item(`User: ${demoUser.name}`, `${demoUser.email} (${authStatus})`, 'create');
  }
}

// ---------------------------------------------------------------------------
// resetDemoData() — Delete everything in FK-safe order
// ---------------------------------------------------------------------------

export async function resetDemoData(prisma: PrismaClient, logger: DemoLogger): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: DEMO_TENANT_ID },
  });

  if (!tenant) {
    logger.info('No demo tenant found — nothing to reset.');
    return;
  }

  const summary = await runReset(prisma, {
    tenantSlug: DEMO_TENANT_ID,
    mode: 'hard',
    yes: true,
    hardConfirm: true,
    dryRun: false,
    onRow: (row) => {
      if (row.action === 'skip-keep') return;
      if (row.count > 0) logger.item(row.table, `${row.count} deleted`);
    },
  });

  // Firebase cleanup (outside transaction — external service)
  initFirebase();
  for (const demoUser of DEMO_USERS) {
    const deleted = await deleteFirebaseUser(demoUser.email);
    if (deleted) {
      logger.item(`Firebase: ${demoUser.email}`, 'deleted');
    }
  }

  logger.info(`Reset complete: ${summary.totalAffected} records deleted in ${summary.durationMs}ms`);
}
