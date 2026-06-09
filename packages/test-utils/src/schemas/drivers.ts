/**
 * API Contracts for Driver endpoints.
 *
 * These Zod schemas define the exact response shape expected from each
 * endpoint. Schemas drift from shared-types `DriverSchema` (a DB shape) —
 * the backend formats responses in-controller per endpoint. Keep the
 * schemas here aligned with `DriversController` / `DriversService` /
 * `DriversActivationService` / `DispatchBoardService` / `DriverTimelineService`.
 *
 * Fields serialized via `?.toISOString()` are OMITTED (not null) when the
 * underlying DB value is null — NestJS strips undefined. Model them as
 * `.nullable().optional()`.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString } from './helpers.js';

// ── Nested shapes ─────────────────────────────────────────────────

const AssignedVehicleSchema = z.object({
  id: dbId,
  vehicleId: stringId,
  unitNumber: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
});

const ActiveLoadCountsSchema = z.object({
  inTransit: z.number().int(),
  assigned: z.number().int(),
  onHold: z.number().int(),
});

const CurrentHosSchema = z
  .object({
    driveRemaining: z.number(),
    shiftRemaining: z.number(),
    cycleRemaining: z.number(),
    breakRemaining: z.number(),
    breakRequired: z.boolean(),
    dataSource: z.string().nullable().optional(),
    lastUpdated: z.string().nullable().optional(),
  })
  .nullable();

const UnavailabilitySchema = z
  .object({
    type: z.string(),
    startDate: z.string(),
    endDate: z.string(),
  })
  .nullable();

// ── GET /drivers — List item ──────────────────────────────────────

export const DriverListItemSchema = z.object({
  id: dbId,
  driverId: stringId,
  name: z.string(),
  licenseNumber: z.string().nullable(),
  licenseState: z.string().nullable(),
  cdlClass: z.string().nullable(),
  endorsements: z.array(z.string()).nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  status: z.string(),
  currentHoursDriven: z.number().nullable(),
  currentOnDutyTime: z.number().nullable(),
  currentHoursSinceBreak: z.number().nullable(),
  cycleHoursUsed: z.number().nullable(),
  currentHos: CurrentHosSchema,
  hosDataSource: z.string().nullable(),
  hosDataSyncedAt: z.string().nullable().optional(),
  eldMetadata: z.unknown().nullable(),
  externalDriverId: z.string().nullable(),
  externalSource: z.string().nullable(),
  lastSyncedAt: z.string().nullable().optional(),
  assignedVehicleId: z.number().nullable(),
  assignedVehicle: AssignedVehicleSchema.nullable(),
  activeLoadCounts: ActiveLoadCountsSchema,
  createdAt: isoDateString,
  updatedAt: isoDateString,
  appAccessStatus: z.enum(['ACTIVE', 'INVITED', 'NO_ACCESS', 'DEACTIVATED']),
  linkedUserId: z.string().nullable(),
  pendingInvitationId: z.string().nullable(),
  upcomingUnavailability: UnavailabilitySchema,
});

// ── POST /drivers — Create response ──────────────────────────────
//
// The controller returns the exact 10 fields listed below; `createdAt`
// and `updatedAt` come straight from Prisma (Date objects, serialized to
// ISO strings via JSON). Safe to make `.strict()`.

export const CreateDriverResponseSchema = z
  .object({
    id: dbId,
    driverId: stringId,
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    cdlClass: z.string(),
    licenseNumber: z.string(),
    licenseState: z.string().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

// ── PUT /drivers/:id — Update response ───────────────────────────
//
// Controller returns explicit fields; `hireDate` / `medicalCardExpiry`
// are date-only strings (`YYYY-MM-DD`) when set, else null.

export const UpdateDriverResponseSchema = z
  .object({
    id: dbId,
    driverId: stringId,
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    cdlClass: z.string(),
    licenseNumber: z.string(),
    licenseState: z.string().nullable(),
    endorsements: z.array(z.string()).nullable(),
    hireDate: z.string().nullable(),
    medicalCardExpiry: z.string().nullable(),
    homeTerminalCity: z.string().nullable(),
    homeTerminalState: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    notes: z.string().nullable(),
    updatedAt: isoDateString,
  })
  .strict();

// ── GET /drivers/:id — Detail response ───────────────────────────

export const DriverDetailSchema = z
  .object({
    id: dbId,
    driverId: stringId,
    name: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    cdlClass: z.string().nullable(),
    licenseNumber: z.string().nullable(),
    licenseState: z.string().nullable(),
    endorsements: z.array(z.string()).nullable(),
    status: z.string(),
    hireDate: z.string().nullable(),
    medicalCardExpiry: z.string().nullable(),
    homeTerminalCity: z.string().nullable(),
    homeTerminalState: z.string().nullable(),
    homeTerminalTimezone: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    notes: z.string().nullable(),
    externalDriverId: z.string().nullable(),
    externalSource: z.string().nullable(),
    syncStatus: z.string().nullable(),
    lastSyncedAt: z.string().nullable().optional(),
    currentHoursDriven: z.number().nullable(),
    currentOnDutyTime: z.number().nullable(),
    currentHoursSinceBreak: z.number().nullable(),
    cycleHoursUsed: z.number().nullable(),
    eldMetadata: z.unknown().nullable(),
    hosData: z.unknown().nullable(),
    assignedVehicleId: z.number().nullable(),
    assignedVehicle: AssignedVehicleSchema.nullable(),
    currentLoad: z.unknown().nullable(),
    upcomingLoads: z.array(z.unknown()),
    appAccessStatus: z.string(),
    linkedUserId: z.string().nullable(),
    pendingInvitationId: z.string().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

// ── Raw Prisma Driver ────────────────────────────────────────────
//
// Used by:
//   POST /drivers/:id/activate    → returns `activatedDriver` (raw Prisma)
//   POST /drivers/:id/deactivate  → returns `deactivatedDriver` (raw Prisma)
//   POST /drivers/:id/reactivate  → returns `reactivated` (raw Prisma)
//   GET  /drivers/pending/list    → array of raw Prisma drivers
//   GET  /drivers/inactive/list   → raw Prisma + `deactivatedByUser` include
//
// Every column in the Prisma `Driver` model appears below. Not `.strict()`
// because Prisma serialization can append relation keys (e.g. `deactivatedByUser`)
// for the inactive list.

export const PrismaDriverSchema = z.object({
  id: dbId,
  driverId: stringId,
  tenantId: z.number().int(),
  name: z.string(),
  licenseNumber: z.string().nullable(),
  licenseState: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  cdlClass: z.string().nullable(),
  endorsements: z.array(z.string()),
  status: z.enum(['PENDING_ACTIVATION', 'ACTIVE', 'INACTIVE', 'SUSPENDED']),
  activatedAt: isoDateString.nullable(),
  activatedBy: z.number().int().nullable(),
  deactivatedAt: isoDateString.nullable(),
  deactivatedBy: z.number().int().nullable(),
  deactivationReason: z.string().nullable(),
  reactivatedAt: isoDateString.nullable(),
  reactivatedBy: z.number().int().nullable(),
  externalDriverId: z.string().nullable(),
  externalSource: z.string().nullable(),
  lastSyncedAt: isoDateString.nullable(),
  syncStatus: z.string().nullable(),
  hosData: z.unknown().nullable(),
  hosDataSyncedAt: isoDateString.nullable(),
  hosDataSource: z.string().nullable(),
  hosManualOverride: z.unknown().nullable(),
  hosOverrideBy: z.number().int().nullable(),
  hosOverrideAt: isoDateString.nullable(),
  hosOverrideReason: z.string().nullable(),
  eldMetadata: z.unknown().nullable(),
  currentHoursDriven: z.number(),
  currentOnDutyTime: z.number(),
  currentHoursSinceBreak: z.number(),
  cycleHoursUsed: z.number(),
  cycleDaysData: z.unknown().nullable(),
  lastRestartAt: isoDateString.nullable(),
  homeTerminalTimezone: z.string(),
  homeTerminalCity: z.string().nullable(),
  homeTerminalState: z.string().nullable(),
  hireDate: isoDateString.nullable(),
  medicalCardExpiry: isoDateString.nullable(),
  cdlExpiry: isoDateString.nullable(),
  mvrDate: isoDateString.nullable(),
  drugTestDate: isoDateString.nullable(),
  annualReviewDate: isoDateString.nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  notes: z.string().nullable(),
  customFieldValues: z.unknown().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  assignedVehicleId: z.number().int().nullable(),
});

// ── GET /drivers/dispatch-board ───────────────────────────────────
//
// Response shape from DispatchBoardService.getDispatchBoard:
//   { drivers: DispatchBoardDriverDto[], summary: DispatchBoardSummaryDto }
// (See apps/backend/src/domains/fleet/drivers/dto/dispatch-board.types.ts.)

const DispatchBoardDriverSchema = z.object({
  driverId: stringId,
  name: z.string(),
  phone: z.string().nullable(),
  status: z.enum(['available', 'onLoad', 'unavailable']),
  unavailability: z
    .object({
      type: z.string(),
      startDate: z.string(),
      endDate: z.string(),
    })
    .nullable(),
  vehicle: z
    .object({
      unitNumber: z.string(),
      equipmentType: z.string(),
    })
    .nullable(),
  currentLoad: z
    .object({
      loadId: z.string(),
      loadNumber: z.string(),
      customerName: z.string(),
      status: z.string(),
      origin: z.string(),
      destination: z.string(),
    })
    .nullable(),
  queuedLoadCount: z.number().int(),
  hos: z
    .object({
      driveRemainingHours: z.number().nullable(),
      dutyRemainingHours: z.number().nullable(),
      cycleRemainingHours: z.number().nullable(),
      breakRemainingHours: z.number().nullable(),
      isCritical: z.boolean(),
      dataAgeMinutes: z.number().nullable(),
    })
    .nullable(),
  location: z
    .object({
      city: z.string(),
      state: z.string(),
    })
    .nullable(),
});

export const DispatchBoardResponseSchema = z
  .object({
    drivers: z.array(DispatchBoardDriverSchema),
    summary: z.object({
      total: z.number().int(),
      onLoad: z.number().int(),
      available: z.number().int(),
      unavailable: z.number().int(),
      hosCritical: z.number().int(),
    }),
  })
  .strict();

// ── GET /drivers/:id/weekly-stats ─────────────────────────────────

export const WeeklyStatsSchema = z
  .object({
    loadsCompleted: z.number().int(),
    milesDriven: z.number(),
    earningsCents: z.number().int(),
  })
  .strict();

// ── GET /drivers/:id/hos ──────────────────────────────────────────
//
// Returns the cached `hosData` blob from IntegrationDataService. When no
// ELD integration is wired, service returns null and the controller
// coerces to null in the response body. Shape is vendor-specific JSON;
// we accept any object or null.

export const HosDataSchema = z.union([z.record(z.string(), z.unknown()), z.null()]);

// ── POST /drivers/:id/activate-and-invite ─────────────────────────
//
// Returns `{ driver, invitation }` where driver is raw Prisma and
// invitation is from UserInvitationsService. We assert the envelope +
// driverId presence; invitation shape is validated loosely.

export const ActivateAndInviteResponseSchema = z
  .object({
    driver: PrismaDriverSchema,
    invitation: z
      .object({
        invitationId: stringId,
      })
      .passthrough(), // Not touched — invitation schema is owned by platform tests.
  })
  .strict();

// NOTE: `.passthrough()` on the inner invitation object is a deliberate
// exception — the UserInvitationsService return shape is owned by the
// platform domain. We only assert the envelope + `invitationId` for
// cross-domain coupling. Not applied to any Driver-owned response.

// ── GET /driver/assistant/timeline ────────────────────────────────────
//
// Response from DriverTimelineService.getTimeline:
//   { entries: TimelineEntry[], cursor: string | null, loadContext: LoadContext | null }

const TimelineEntrySchema = z.object({
  id: z.string(),
  type: z.enum(['assistant', 'operations', 'alert', 'driver', 'system']),
  content: z.string(),
  timestamp: isoDateString,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const LoadContextSchema = z
  .object({
    loadId: z.string(),
    loadNumber: z.string(),
    status: z.string(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    customerName: z.string().optional(),
    currentStop: z
      .object({
        name: z.string(),
        location: z.string(),
        eta: z.string().optional(),
      })
      .optional(),
  })
  .nullable();

export const TimelineResponseSchema = z
  .object({
    entries: z.array(TimelineEntrySchema),
    cursor: z.string().nullable(),
    loadContext: LoadContextSchema,
  })
  .strict();
