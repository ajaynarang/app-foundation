/**
 * Phase 3 API contracts for `/command-center/*` endpoints. Shared-types
 * already models overview/system-health/message-summary/shift-notes; this
 * file re-exports them and adds `CommandCenterMapDataSchema` (no shared-types
 * Zod coverage — only a backend-side TypeScript interface in
 * `apps/backend/src/domains/operations/command-center/dto/map-data.dto.ts`).
 *
 * Tower v3 (PR #752) adds three more endpoints on the same controller —
 * `active-loads`, `risk-scores`, `wire`. Their Zod contracts DO live in
 * shared-types (`operations/tower.schema.ts`); re-exported below so the QA
 * suite has one schema-barrel entry per command-center endpoint.
 */
import { z } from 'zod';
import { isoDateString } from './helpers.js';
import {
  CommandCenterOverviewSchema as SharedCommandCenterOverviewSchema,
  SystemHealthSchema as SharedSystemHealthSchema,
  MessageSummaryResponseSchema as SharedMessageSummaryResponseSchema,
  ActiveLoadViewSchema as SharedActiveLoadViewSchema,
  RiskScoreSchema as SharedRiskScoreSchema,
  WireItemSchema as SharedWireItemSchema,
} from '@app/shared-types';

/** `GET /command-center/overview`. */
export const CommandCenterOverviewSharedSchema = SharedCommandCenterOverviewSchema;

/** `GET /command-center/system-health`. */
export const CommandCenterSystemHealthSchema = SharedSystemHealthSchema;

/** `GET /command-center/message-summary`. */
export const CommandCenterMessageSummarySchema = SharedMessageSummaryResponseSchema;

// ── Tower v3 (re-exported from shared-types `operations/tower.schema.ts`) ─────

/** Element of the `GET /command-center/active-loads` array response. */
export const ActiveLoadViewSchema = SharedActiveLoadViewSchema;

/** Element of the `GET /command-center/risk-scores` array response. */
export const RiskScoreSchema = SharedRiskScoreSchema;

/** Element of the `GET /command-center/wire` array response. */
export const WireItemSchema = SharedWireItemSchema;

// ── Map data (hand-written) ──────────────────────────────────────────────────

const MapLatLngCitySchema = z.object({ lat: z.number(), lng: z.number(), city: z.string() }).strict();

/**
 * A geocoded stop on the selected truck's load route. Mirrors
 * `MapRouteStopDto` in the backend `map-data.dto.ts` exactly.
 */
const MapRouteStopSchema = z
  .object({
    sequenceOrder: z.number(),
    actionType: z.enum(['pickup', 'delivery', 'stop']),
    lat: z.number(),
    lng: z.number(),
    city: z.string(),
    state: z.string().nullable(),
  })
  .strict();

const MapTruckLocationSchema = z
  .object({
    driverId: z.string(),
    driverName: z.string(),
    vehicleId: z.string(),
    vehicleIdentifier: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    heading: z.number(),
    speedMph: z.number(),
    status: z.enum(['moving', 'idle', 'parked']),
    hosDriveRemaining: z.number(),
    hosDutyRemaining: z.number(),
    hosStatus: z.enum(['safe', 'warning', 'critical', 'none']),
    fuelLevel: z.number().nullable(),
    // Aligned with `MapTruckLocationDto.activeLoad`: `loadNumber` is the only
    // load identifier (no `loadId`), and `stops` carries the geocoded route.
    activeLoad: z
      .object({
        loadNumber: z.string(),
        referenceNumber: z.string().nullable(),
        origin: MapLatLngCitySchema,
        destination: MapLatLngCitySchema,
        stops: z.array(MapRouteStopSchema),
        etaStatus: z.enum(['on_time', 'at_risk', 'late']),
      })
      .strict()
      .nullable(),
    lastUpdated: isoDateString,
  })
  .strict();

const MapUnassignedLoadSchema = z
  .object({
    loadNumber: z.string(),
    referenceNumber: z.string().nullable(),
    origin: MapLatLngCitySchema,
    destination: MapLatLngCitySchema,
    customerName: z.string(),
    pickupDate: isoDateString,
  })
  .strict();

/** `GET /command-center/map-data` response envelope. */
export const CommandCenterMapDataSchema = z
  .object({
    trucks: z.array(MapTruckLocationSchema),
    unassignedLoads: z.array(MapUnassignedLoadSchema),
    lastUpdated: isoDateString,
  })
  .strict();
