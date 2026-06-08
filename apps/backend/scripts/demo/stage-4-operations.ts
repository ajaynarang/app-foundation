/**
 * Stage 4 — Operations Data (Alerts, Shield, Routes, Notifications)
 *
 * Creates realistic operational data: alerts with notes, shield audits
 * with findings, route plans with segments, and dispatcher notifications.
 */
import { PrismaClient, RoutePlanStatus, RouteSegmentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DEMO_TENANT_ID, DEMO_USERS } from './config';
import { DemoLogger } from './helpers/logger';
import { createRng, randomInt, randomElement } from './helpers/generators';
import { daysAgo, addHours } from './helpers/date-utils';
import { generateUuidV7 } from '../../src/shared/utils/uuidv7';
import {
  DRIVER_CONVERSATION_USER_MODE,
  driverConversationId,
} from '../../src/domains/fleet/loads/driver-messages.constants';

// ---------------------------------------------------------------------------
// Alert Definitions
// ---------------------------------------------------------------------------

interface AlertDef {
  alertType: string;
  category: string;
  priority: string;
  scope: string;
  title: string;
  message: string;
  recommendedAction?: string;
  status: string;
  // Timing offsets (hours ago for createdAt)
  hoursAgo: number;
  // Resolution
  autoResolved?: boolean;
  autoResolveReason?: string;
  resolutionNotes?: string;
  // Acknowledge / Snooze
  acknowledged?: boolean;
  snoozedHours?: number;
  // Note content
  noteContent?: string;
}

const ACTIVE_ALERTS: AlertDef[] = [
  {
    alertType: 'HOS_APPROACHING_LIMIT',
    category: 'hos',
    priority: 'high',
    scope: 'driver',
    title: 'HOS Approaching Limit',
    message: '2.5 hours of drive time remaining before mandatory 10-hour break.',
    recommendedAction: 'Plan next rest stop within 150 miles.',
    status: 'active',
    hoursAgo: 1,
  },
  {
    alertType: 'BREAK_REQUIRED',
    category: 'hos',
    priority: 'medium',
    scope: 'driver',
    title: 'Break Required',
    message: '7 hours since last 30-minute break. Break required within 1 hour.',
    recommendedAction: 'Take 30-minute break at next safe location.',
    status: 'active',
    hoursAgo: 0.5,
  },
  {
    alertType: 'MISSED_APPOINTMENT',
    category: 'dispatch',
    priority: 'high',
    scope: 'load',
    title: 'Missed Pickup Appointment',
    message: 'Pickup appointment was 2 hours ago. No dock-in recorded.',
    recommendedAction: 'Contact driver and shipper to reschedule.',
    status: 'active',
    hoursAgo: 2,
  },
  {
    alertType: 'NO_PICKUP_ACTIVITY',
    category: 'dispatch',
    priority: 'high',
    scope: 'load',
    title: 'No Pickup Activity',
    message: 'Driver has not moved toward pickup location. Load pickup in 3 hours.',
    recommendedAction: 'Confirm driver availability and ETA.',
    status: 'active',
    hoursAgo: 3,
  },
];

const ACKNOWLEDGED_ALERT: AlertDef = {
  alertType: 'DOCK_TIME_EXCEEDED',
  category: 'dispatch',
  priority: 'medium',
  scope: 'load',
  title: 'Dock Time Exceeded',
  message: 'Driver has been at dock for 3.5 hours (estimated: 1.5 hours).',
  status: 'acknowledged',
  hoursAgo: 4,
  acknowledged: true,
  noteContent: 'Called driver, ETA 30 min. Warehouse was short-staffed today.',
};

const SNOOZED_ALERT: AlertDef = {
  alertType: 'OFF_PACE',
  category: 'dispatch',
  priority: 'medium',
  scope: 'load',
  title: 'Off Pace',
  message: 'Driver is 45 minutes behind schedule. May miss delivery window.',
  status: 'snoozed',
  hoursAgo: 3,
  snoozedHours: 2,
};

const RESOLVED_RECENT: AlertDef[] = [
  {
    alertType: 'APPOINTMENT_AT_RISK',
    category: 'dispatch',
    priority: 'medium',
    scope: 'load',
    title: 'Appointment At Risk',
    message: 'ETA was 30 minutes past delivery window.',
    status: 'resolved',
    hoursAgo: 8,
    autoResolved: true,
    autoResolveReason: 'Delivered on time after speed adjustment.',
  },
  {
    alertType: 'SPEEDING',
    category: 'safety',
    priority: 'low',
    scope: 'driver',
    title: 'Speeding Event',
    message: 'Driver exceeded speed limit by 8 mph on I-95.',
    status: 'resolved',
    hoursAgo: 12,
    autoResolved: true,
    autoResolveReason: 'Speed normalized after passing construction zone.',
  },
];

const RESOLVED_HISTORICAL: AlertDef[] = [
  {
    alertType: 'HOS_VIOLATION',
    category: 'hos',
    priority: 'critical',
    scope: 'driver',
    title: 'HOS Violation',
    message: 'Driver exceeded 11-hour driving limit by 23 minutes.',
    status: 'resolved',
    hoursAgo: 21 * 24,
    resolutionNotes: 'Driver counseled. Documented in safety file.',
  },
  {
    alertType: 'MISSED_APPOINTMENT',
    category: 'dispatch',
    priority: 'high',
    scope: 'load',
    title: 'Missed Delivery Appointment',
    message: 'Delivery arrived 4 hours past appointment window.',
    status: 'resolved',
    hoursAgo: 18 * 24,
    resolutionNotes: 'Customer notified, no penalty assessed.',
  },
  {
    alertType: 'BREAK_REQUIRED',
    category: 'hos',
    priority: 'medium',
    scope: 'driver',
    title: 'Break Required',
    message: '8 hours since last 30-minute break.',
    status: 'resolved',
    hoursAgo: 14 * 24,
    autoResolved: true,
    autoResolveReason: 'Driver took required break.',
  },
];

// Additional historical resolved alerts for trend data
const HISTORICAL_TYPES: { alertType: string; category: string; priority: string; title: string; message: string }[] = [
  {
    alertType: 'SPEEDING',
    category: 'safety',
    priority: 'low',
    title: 'Speeding Event',
    message: 'Speed exceeded by 6 mph.',
  },
  {
    alertType: 'OFF_PACE',
    category: 'dispatch',
    priority: 'medium',
    title: 'Off Pace',
    message: 'Behind schedule by 30 minutes.',
  },
  {
    alertType: 'BREAK_REQUIRED',
    category: 'hos',
    priority: 'medium',
    title: 'Break Required',
    message: 'Break overdue.',
  },
  {
    alertType: 'APPOINTMENT_AT_RISK',
    category: 'dispatch',
    priority: 'medium',
    title: 'Appointment At Risk',
    message: 'May miss delivery window.',
  },
  {
    alertType: 'DOCK_TIME_EXCEEDED',
    category: 'dispatch',
    priority: 'low',
    title: 'Dock Time Exceeded',
    message: 'Extended dock time at facility.',
  },
  {
    alertType: 'HOS_APPROACHING_LIMIT',
    category: 'hos',
    priority: 'high',
    title: 'HOS Approaching Limit',
    message: 'Approaching daily drive limit.',
  },
  {
    alertType: 'NO_PICKUP_ACTIVITY',
    category: 'dispatch',
    priority: 'medium',
    title: 'No Pickup Activity',
    message: 'No movement toward pickup.',
  },
];

// ---------------------------------------------------------------------------
// run()
// ---------------------------------------------------------------------------

export async function run(prisma: PrismaClient, logger: DemoLogger): Promise<void> {
  const rng = createRng('stage-4-operations');

  // Resolve demo tenant
  const tenant = await prisma.tenant.findUnique({
    where: { tenantId: DEMO_TENANT_ID },
  });
  if (!tenant) {
    throw new Error('Demo tenant not found — run Stage 0 first.');
  }
  const tenantIntId = tenant.id;

  // Check idempotency
  const existingAlerts = await prisma.alert.count({
    where: { tenantId: tenantIntId },
  });
  if (existingAlerts > 0) {
    logger.item('Alerts', `${existingAlerts} already exist — skipping`, 'skip');
    return;
  }

  // Load drivers, vehicles, loads
  const drivers = await prisma.driver.findMany({
    where: { tenantId: tenantIntId, externalDriverId: { not: null } },
  });
  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId: tenantIntId, externalVehicleId: { not: null } },
  });
  const loads = await prisma.load.findMany({
    where: { tenantId: tenantIntId },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });

  // Find dispatcher user for notifications and alert attribution
  const dispatcherUser = await prisma.user.findFirst({
    where: { tenantId: tenantIntId, role: 'DISPATCHER' },
  });
  if (!dispatcherUser) {
    throw new Error('No dispatcher user found — run Stage 0 first.');
  }

  const now = new Date();

  // -------------------------------------------------------------------------
  // 1. Create Alerts
  // -------------------------------------------------------------------------

  let alertSeq = 0;
  let totalAlerts = 0;
  let totalAlertNotes = 0;

  async function createAlert(def: AlertDef): Promise<void> {
    const driver = drivers[alertSeq % drivers.length];
    const vehicle = vehicles.length > 0 ? vehicles[alertSeq % vehicles.length] : null;
    const load = def.scope === 'load' && loads.length > 0 ? loads[alertSeq % loads.length] : null;

    const createdAt = addHours(now, -def.hoursAgo);
    const alertId = `alert_demo_${alertSeq.toString().padStart(3, '0')}`;

    const data: any = {
      alertId,
      tenantId: tenantIntId,
      driverId: driver.driverId,
      vehicleId: vehicle?.vehicleId ?? null,
      loadId: load?.loadNumber ?? null,
      scope: def.scope,
      alertType: def.alertType,
      category: def.category,
      priority: def.priority,
      title: def.title,
      message: def.message,
      recommendedAction: def.recommendedAction ?? null,
      status: def.status,
      createdAt,
    };

    if (def.acknowledged || def.status === 'acknowledged') {
      data.acknowledgedAt = addHours(createdAt, 0.5);
      data.acknowledgedBy = dispatcherUser.userId;
    }

    if (def.snoozedHours) {
      data.snoozedUntil = addHours(now, def.snoozedHours);
    }

    if (def.status === 'resolved') {
      const resolveDelay = def.hoursAgo > 48 ? randomInt(1, 24, rng) : randomInt(1, 4, rng);
      data.resolvedAt = addHours(createdAt, resolveDelay);
      data.autoResolved = def.autoResolved ?? false;
      data.autoResolveReason = def.autoResolveReason ?? null;
      data.resolvedBy = def.autoResolved ? null : dispatcherUser.userId;
      data.resolutionNotes = def.resolutionNotes ?? null;
    }

    const alert = await prisma.alert.create({ data });
    totalAlerts++;

    // Create alert note if specified
    if (def.noteContent) {
      await prisma.alertNote.create({
        data: {
          alertId: alert.id,
          authorId: dispatcherUser.userId,
          authorName: `${dispatcherUser.firstName} ${dispatcherUser.lastName}`,
          content: def.noteContent,
          createdAt: addHours(createdAt, 0.5),
        },
      });
      totalAlertNotes++;
    }

    alertSeq++;
  }

  // Active alerts
  for (const def of ACTIVE_ALERTS) {
    await createAlert(def);
  }

  // Acknowledged
  await createAlert(ACKNOWLEDGED_ALERT);

  // Snoozed
  await createAlert(SNOOZED_ALERT);

  // Resolved recent
  for (const def of RESOLVED_RECENT) {
    await createAlert(def);
  }

  // Resolved historical
  for (const def of RESOLVED_HISTORICAL) {
    await createAlert(def);
  }

  // 14 additional historical resolved for trends
  for (let i = 0; i < 14; i++) {
    const typeDef = HISTORICAL_TYPES[i % HISTORICAL_TYPES.length];
    await createAlert({
      ...typeDef,
      scope: 'driver',
      status: 'resolved',
      hoursAgo: randomInt(3, 30, rng) * 24,
      autoResolved: rng() < 0.6,
      autoResolveReason: rng() < 0.6 ? 'Condition cleared automatically.' : undefined,
      resolutionNotes: rng() >= 0.6 ? 'Reviewed and resolved by dispatch.' : undefined,
    });
  }

  logger.item('Alerts', `${totalAlerts} created`);
  logger.item('Alert notes', `${totalAlertNotes} created`);

  // -------------------------------------------------------------------------
  // 2. Shield Audits & Findings
  // -------------------------------------------------------------------------

  const SHIELD_SCORES = [
    { overall: 65, hos: 60, drivers: 70, vehicles: 55, loads: 75, label: 'VULNERABLE' as const, weeksAgo: 4 },
    { overall: 71, hos: 68, drivers: 74, vehicles: 65, loads: 77, label: 'AT_RISK' as const, weeksAgo: 3 },
    { overall: 75, hos: 72, drivers: 78, vehicles: 70, loads: 80, label: 'AT_RISK' as const, weeksAgo: 2 },
    { overall: 78, hos: 75, drivers: 82, vehicles: 72, loads: 83, label: 'AT_RISK' as const, weeksAgo: 1 },
  ];

  let totalAudits = 0;
  let totalFindings = 0;
  let latestAuditId: string | null = null;

  for (const score of SHIELD_SCORES) {
    const auditDate = daysAgo(score.weeksAgo * 7);
    const completedAt = addHours(auditDate, 0.1); // ~6 minutes

    const audit = await prisma.shieldAudit.create({
      data: {
        id: generateUuidV7(),
        tenantId: tenantIntId,
        scope: 'FULL',
        status: 'COMPLETED',
        overallScore: score.overall,
        hosScore: score.hos,
        driversScore: score.drivers,
        vehiclesScore: score.vehicles,
        loadsScore: score.loads,
        statusLabel: score.label,
        triggeredBy: 'scheduled',
        startedAt: auditDate,
        completedAt,
        durationMs: randomInt(4000, 8000, rng),
        auditPeriodDays: 30,
        includeAi: false,
        createdAt: auditDate,
      },
    });

    if (score.weeksAgo === 1) {
      latestAuditId = audit.id;
    }

    totalAudits++;
  }

  // Create findings for the latest audit
  if (latestAuditId) {
    const findingsDefs = [
      {
        category: 'DRIVERS' as const,
        severity: 'CRITICAL' as const,
        title: 'Expired Medical Certificate',
        description: 'Medical certificate expired 5 days ago. Driver cannot legally operate CMV.',
        entityType: 'driver',
        entityId: drivers[0]?.driverId,
        entityName: drivers[0]?.name,
        impact: 'Driver is out of compliance with FMCSA medical requirements.',
        recommendation: 'Schedule immediate DOT physical examination.',
        regulation: 'FMCSA 391.45',
      },
      {
        category: 'DRIVERS' as const,
        severity: 'WARNING' as const,
        title: 'CDL Expiring Soon',
        description: 'Commercial driver license expires in 20 days.',
        entityType: 'driver',
        entityId: drivers[1]?.driverId ?? drivers[0]?.driverId,
        entityName: drivers[1]?.name ?? drivers[0]?.name,
        impact: 'Driver will be unable to operate after expiration.',
        recommendation: 'Begin CDL renewal process immediately.',
        regulation: 'FMCSA 383.23',
      },
      {
        category: 'VEHICLES' as const,
        severity: 'WARNING' as const,
        title: 'Annual Inspection Due',
        description: 'Annual vehicle inspection due in 5 days.',
        entityType: 'vehicle',
        entityId: vehicles[0]?.vehicleId,
        entityName: `Unit ${vehicles[0]?.unitNumber}`,
        impact: 'Vehicle will be out of compliance with FMCSA inspection requirements.',
        recommendation: 'Schedule inspection at certified facility.',
        regulation: 'FMCSA 396.17',
      },
      {
        category: 'VEHICLES' as const,
        severity: 'WARNING' as const,
        title: 'Maintenance Overdue',
        description: 'Scheduled preventive maintenance is 3 days overdue.',
        entityType: 'vehicle',
        entityId: vehicles.length > 1 ? vehicles[1].vehicleId : vehicles[0]?.vehicleId,
        entityName: vehicles.length > 1 ? `Unit ${vehicles[1].unitNumber}` : `Unit ${vehicles[0]?.unitNumber}`,
        impact: 'Increased risk of mechanical failure and roadside inspection issues.',
        recommendation: 'Schedule maintenance within 48 hours.',
      },
      {
        category: 'HOS' as const,
        severity: 'WARNING' as const,
        title: 'Approaching Weekly Cycle Limit',
        description: 'Driver has used 58 of 60 hours in 7-day cycle.',
        entityType: 'driver',
        entityId: drivers[2]?.driverId ?? drivers[0]?.driverId,
        entityName: drivers[2]?.name ?? drivers[0]?.name,
        impact: 'Driver will need 34-hour restart before continuing operations.',
        recommendation: 'Plan 34-hour restart period within next 2 hours of on-duty time.',
        regulation: 'FMCSA 395.3',
      },
      {
        category: 'LOADS' as const,
        severity: 'WARNING' as const,
        title: 'Missing BOL Document',
        description: 'Bill of Lading not uploaded for delivered load.',
        entityType: 'load',
        entityId: loads[0]?.loadNumber,
        entityName: loads[0]?.loadNumber,
        impact: 'Incomplete documentation may delay invoicing and compliance audits.',
        recommendation: 'Request driver to upload BOL scan.',
      },
      {
        category: 'LOADS' as const,
        severity: 'WARNING' as const,
        title: 'Reefer Temperature Not Logged',
        description: 'No temperature readings recorded for reefer load in transit.',
        entityType: 'load',
        entityId: loads[1]?.loadNumber ?? loads[0]?.loadNumber,
        entityName: loads[1]?.loadNumber ?? loads[0]?.loadNumber,
        impact: 'Cannot verify cold chain compliance. Potential cargo claim risk.',
        recommendation: 'Contact driver to verify reefer unit operation and log temperatures.',
      },
    ];

    for (const f of findingsDefs) {
      await prisma.shieldFinding.create({
        data: {
          id: generateUuidV7(),
          auditId: latestAuditId,
          tenantId: tenantIntId,
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          entityType: f.entityType,
          entityId: f.entityId ?? null,
          entityName: f.entityName ?? null,
          impact: f.impact,
          recommendation: f.recommendation,
          regulation: f.regulation ?? null,
          isResolved: false,
        },
      });
      totalFindings++;
    }
  }

  logger.item('Shield audits', `${totalAudits} created`);
  logger.item('Shield findings', `${totalFindings} created`);

  // -------------------------------------------------------------------------
  // 3. Route Plans (3)
  // -------------------------------------------------------------------------

  let totalPlans = 0;
  let totalSegments = 0;
  let totalPlanLoads = 0;

  // We need at least 3 drivers and vehicles
  if (drivers.length >= 3 && vehicles.length >= 3) {
    const planDefs = [
      {
        label: 'Plan A (in progress, 4 stops)',
        driverIdx: 0,
        vehicleIdx: 0,
        status: RoutePlanStatus.ACTIVE,
        isActive: true,
        totalMiles: 380,
        driveHours: 7.5,
        segments: [
          {
            seq: 0,
            type: 'drive',
            from: 'Boston, MA',
            to: 'Hartford, CT',
            miles: 100,
            hours: 2.2,
            status: RouteSegmentStatus.COMPLETED,
          },
          {
            seq: 1,
            type: 'dock',
            from: 'Hartford, CT',
            to: 'Hartford, CT',
            miles: 0,
            hours: 1.5,
            status: RouteSegmentStatus.COMPLETED,
          },
          {
            seq: 2,
            type: 'drive',
            from: 'Hartford, CT',
            to: 'New York, NY',
            miles: 120,
            hours: 2.5,
            status: RouteSegmentStatus.IN_PROGRESS,
          },
          {
            seq: 3,
            type: 'dock',
            from: 'New York, NY',
            to: 'New York, NY',
            miles: 0,
            hours: 1.0,
            status: RouteSegmentStatus.PLANNED,
          },
        ],
        departureHoursAgo: 6,
      },
      {
        label: 'Plan B (in progress, starting)',
        driverIdx: 1,
        vehicleIdx: 1,
        status: RoutePlanStatus.ACTIVE,
        isActive: true,
        totalMiles: 215,
        driveHours: 4.5,
        segments: [
          {
            seq: 0,
            type: 'dock',
            from: 'Boston, MA',
            to: 'Boston, MA',
            miles: 0,
            hours: 1.5,
            status: RouteSegmentStatus.IN_PROGRESS,
          },
          {
            seq: 1,
            type: 'drive',
            from: 'Boston, MA',
            to: 'Providence, RI',
            miles: 50,
            hours: 1.1,
            status: RouteSegmentStatus.PLANNED,
          },
          {
            seq: 2,
            type: 'dock',
            from: 'Providence, RI',
            to: 'Providence, RI',
            miles: 0,
            hours: 1.0,
            status: RouteSegmentStatus.PLANNED,
          },
        ],
        departureHoursAgo: 1,
      },
      {
        label: 'Plan C (planned, tomorrow)',
        driverIdx: 2,
        vehicleIdx: 2,
        status: RoutePlanStatus.DRAFT,
        isActive: false,
        totalMiles: 450,
        driveHours: 9.0,
        segments: [
          {
            seq: 0,
            type: 'dock',
            from: 'Boston, MA',
            to: 'Boston, MA',
            miles: 0,
            hours: 1.5,
            status: RouteSegmentStatus.PLANNED,
          },
          {
            seq: 1,
            type: 'drive',
            from: 'Boston, MA',
            to: 'Manchester, NH',
            miles: 55,
            hours: 1.2,
            status: RouteSegmentStatus.PLANNED,
          },
          {
            seq: 2,
            type: 'dock',
            from: 'Manchester, NH',
            to: 'Manchester, NH',
            miles: 0,
            hours: 1.0,
            status: RouteSegmentStatus.PLANNED,
          },
          {
            seq: 3,
            type: 'drive',
            from: 'Manchester, NH',
            to: 'Portland, ME',
            miles: 100,
            hours: 2.0,
            status: RouteSegmentStatus.PLANNED,
          },
          {
            seq: 4,
            type: 'dock',
            from: 'Portland, ME',
            to: 'Portland, ME',
            miles: 0,
            hours: 1.0,
            status: RouteSegmentStatus.PLANNED,
          },
        ],
        departureHoursAgo: -18, // tomorrow
      },
    ];

    // Find some in-transit or delivered loads to link
    const linkableLoads = await prisma.load.findMany({
      where: {
        tenantId: tenantIntId,
        status: { in: ['IN_TRANSIT', 'DELIVERED'] },
        driverId: { in: [drivers[0].id, drivers[1].id, drivers[2].id] },
      },
      take: 6,
    });

    for (let p = 0; p < planDefs.length; p++) {
      const pd = planDefs[p];
      const driver = drivers[pd.driverIdx];
      const vehicle = vehicles[pd.vehicleIdx];
      const planId = `plan_demo_${(p + 1).toString().padStart(3, '0')}`;
      const departureTime = addHours(now, -pd.departureHoursAgo);

      const plan = await prisma.routePlan.create({
        data: {
          planId,
          driverId: driver.id,
          vehicleId: vehicle.id,
          status: pd.status,
          isActive: pd.isActive,
          totalDistanceMiles: pd.totalMiles,
          totalDriveTimeHours: pd.driveHours,
          totalOnDutyTimeHours: pd.driveHours + 3, // drive + dock time
          totalTripTimeHours: pd.driveHours + 5,
          totalDrivingDays: 1,
          optimizationPriority: 'minimize_time',
          isFeasible: true,
          departureTime,
          estimatedArrival: addHours(departureTime, pd.driveHours + 5),
          activatedAt: pd.isActive ? departureTime : null,
          tenantId: tenantIntId,
        },
      });
      totalPlans++;

      // Create segments
      for (const seg of pd.segments) {
        const segId = `seg_demo_${(p + 1).toString().padStart(3, '0')}_${seg.seq.toString().padStart(2, '0')}`;

        await prisma.routeSegment.create({
          data: {
            segmentId: segId,
            planId: plan.id,
            sequenceOrder: seg.seq,
            fromLocation: seg.from,
            toLocation: seg.to,
            segmentType: seg.type,
            distanceMiles: seg.miles,
            driveTimeHours: seg.type === 'drive' ? seg.hours : null,
            dockDurationHours: seg.type === 'dock' ? seg.hours : null,
            status: seg.status,
            estimatedArrival: addHours(departureTime, seg.seq * 2),
            estimatedDeparture: addHours(departureTime, seg.seq * 2 + seg.hours),
            actualArrival: seg.status === RouteSegmentStatus.COMPLETED ? addHours(departureTime, seg.seq * 2) : null,
            actualDeparture:
              seg.status === RouteSegmentStatus.COMPLETED ? addHours(departureTime, seg.seq * 2 + seg.hours) : null,
          },
        });
        totalSegments++;
      }

      // Link loads to plans
      const driverLoads = linkableLoads.filter((l) => l.driverId === driver.id);
      for (const dl of driverLoads.slice(0, 2)) {
        // Check if this load is already linked to a plan
        const existing = await prisma.routePlanLoad.findFirst({
          where: { planId: plan.id, loadId: dl.id },
        });
        if (!existing) {
          await prisma.routePlanLoad.create({
            data: {
              planId: plan.id,
              loadId: dl.id,
            },
          });
          totalPlanLoads++;
        }
      }

      logger.item(`Route plan: ${planId}`, pd.label, 'create');
    }
  } else {
    logger.warn('Not enough drivers/vehicles for route plans — skipping');
  }

  logger.item('Route plans', `${totalPlans} created`);
  logger.item('Route segments', `${totalSegments} created`);
  logger.item('Route plan loads', `${totalPlanLoads} linked`);

  // -------------------------------------------------------------------------
  // 4. Notifications (~10)
  // -------------------------------------------------------------------------

  const notificationDefs = [
    {
      type: 'INVOICE_GENERATED' as const,
      category: 'BILLING' as const,
      title: 'Invoice Generated',
      message: 'Invoice NL-INV-1003 generated for Northeast Distribution Co.',
      actionUrl: '/dispatcher/billing',
      iconType: 'invoice',
      hoursAgo: 2,
      read: false,
    },
    {
      type: 'INVOICE_OVERDUE' as const,
      category: 'BILLING' as const,
      title: 'Invoice Overdue',
      message: 'Invoice NL-INV-1008 from Harbor Freight Solutions is 15 days overdue ($2,340.00).',
      actionUrl: '/dispatcher/billing',
      iconType: 'warning',
      hoursAgo: 6,
      read: false,
    },
    {
      type: 'SETTLEMENT_READY' as const,
      category: 'BILLING' as const,
      title: 'Settlement Approved',
      message: 'Settlement NL-SET-105 approved for driver pay processing.',
      actionUrl: '/dispatcher/pay',
      iconType: 'settlement',
      hoursAgo: 12,
      read: true,
    },
    {
      type: 'PAYMENT_RECEIVED' as const,
      category: 'BILLING' as const,
      title: 'Payment Received',
      message: 'Payment of $4,250.00 received from Cape Cod Seafood Export via ACH.',
      actionUrl: '/dispatcher/billing',
      iconType: 'payment',
      hoursAgo: 24,
      read: true,
    },
    {
      type: 'SHIELD_AUDIT_CRITICAL' as const,
      category: 'SYSTEM' as const,
      title: 'Shield Score Improved',
      message: 'Shield compliance score improved from 75 to 78. 1 critical finding remains.',
      actionUrl: '/dispatcher/shield',
      iconType: 'shield',
      hoursAgo: 48,
      read: true,
    },
    {
      type: 'INTEGRATION_SYNC_COMPLETED' as const,
      category: 'SYSTEM' as const,
      title: 'Samsara Sync Complete',
      message: 'ELD data sync completed. 8 drivers and 6 vehicles updated.',
      actionUrl: '/admin/integrations',
      iconType: 'sync',
      hoursAgo: 4,
      read: false,
    },
    {
      type: 'DRIVER_ACTIVATED' as const,
      category: 'TEAM' as const,
      title: 'Driver Activated',
      message: `${drivers[0]?.name ?? 'New driver'} has been activated and is ready for dispatch.`,
      actionUrl: '/dispatcher/fleet',
      iconType: 'driver',
      hoursAgo: 72,
      read: true,
    },
    {
      type: 'DOCUMENT_EXPIRING_SOON' as const,
      category: 'BILLING' as const,
      title: 'Document Expiring',
      message: `Medical certificate for ${drivers[1]?.name ?? 'driver'} expires in 5 days.`,
      actionUrl: '/dispatcher/fleet',
      iconType: 'document',
      hoursAgo: 8,
      read: false,
    },
    {
      type: 'INVOICE_SENT' as const,
      category: 'BILLING' as const,
      title: 'Invoice Sent',
      message: 'Invoice NL-INV-1015 sent to Pilgrim Manufacturing.',
      actionUrl: '/dispatcher/billing',
      iconType: 'invoice',
      hoursAgo: 18,
      read: true,
    },
    {
      type: 'SETTINGS_UPDATED' as const,
      category: 'SYSTEM' as const,
      title: 'Settings Updated',
      message: 'Fleet operations settings updated by admin.',
      actionUrl: '/admin/settings',
      iconType: 'settings',
      hoursAgo: 96,
      read: true,
    },
  ];

  let totalNotifications = 0;

  for (const n of notificationDefs) {
    const createdAt = addHours(now, -n.hoursAgo);

    await prisma.notification.create({
      data: {
        type: n.type,
        channel: 'IN_APP',
        recipient: dispatcherUser.email ?? DEMO_USERS[0].email,
        status: 'SENT',
        tenantId: tenantIntId,
        userId: dispatcherUser.id,
        category: n.category,
        title: n.title,
        message: n.message,
        actionUrl: n.actionUrl,
        iconType: n.iconType,
        readAt: n.read ? addHours(createdAt, randomInt(1, 4, rng)) : null,
        sentAt: createdAt,
        createdAt,
      },
    });
    totalNotifications++;
  }

  logger.item('Notifications', `${totalNotifications} created`);

  // -------------------------------------------------------------------------
  // 4. Driver-keyed conversations — so the Tower Messages tab isn't empty.
  //    One persistent thread per seeded driver; a few recent messages, the
  //    last from the driver so the row shows as "needs reply".
  // -------------------------------------------------------------------------
  let conversationCount = 0;
  let messageCount = 0;
  const conversationDrivers = drivers.slice(0, 5);

  for (const driver of conversationDrivers) {
    const conversation = await prisma.conversation.create({
      data: {
        conversationId: driverConversationId(tenantIntId, driver.driverId),
        tenant: { connect: { id: tenantIntId } },
        driver: { connect: { id: driver.id } },
        userMode: DRIVER_CONVERSATION_USER_MODE,
        isActive: true,
      },
    });
    conversationCount++;

    // A driver's active load tags the thread, when they have one.
    const activeLoad = loads.find((l) => l.driverId === driver.id) ?? null;
    const seedMessages: Array<{ role: 'driver' | 'dispatcher'; content: string; minutesAgo: number }> = [
      { role: 'dispatcher', content: 'Morning — confirming you got the updated appointment time?', minutesAgo: 28 },
      { role: 'driver', content: 'Yep, got it. Rolling now.', minutesAgo: 24 },
      { role: 'driver', content: 'Heads up — backed up at the scale, looking at ~30 min.', minutesAgo: 6 },
    ];

    for (const m of seedMessages) {
      await prisma.conversationMessage.create({
        data: {
          messageId: `msg-${randomUUID()}`,
          conversationId: conversation.id,
          role: m.role,
          content: m.content,
          inputMode: m.role,
          loadId: activeLoad?.id ?? null,
          createdAt: addHours(now, -m.minutesAgo / 60),
        },
      });
      messageCount++;
    }
  }

  logger.item('Driver conversations', `${conversationCount} threads, ${messageCount} messages`);
}
