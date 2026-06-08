import { z } from 'zod';

import {
  RoutePlanStatusSchema,
  type RoutePlanStatus,
  RouteSegmentStatusSchema,
  type RouteSegmentStatus,
} from '../generated/prisma-enums';

// ─── Status enums ───
// Re-exported from the generated Prisma mirror so `schema.prisma` stays the
// single source of truth. Hand-editing these here is forbidden — change the
// Prisma enum and `pnpm prisma:generate` flows the new shape through.
export { RoutePlanStatusSchema, RouteSegmentStatusSchema };
export type { RoutePlanStatus, RouteSegmentStatus };

// ─── Request Types ───

export const CreateRoutePlanInputSchema = z.object({
  driverId: z.string(),
  vehicleId: z.string(),
  loadIds: z.array(z.string()).min(1),
  departureTime: z.string(), // ISO 8601 datetime
  optimizationPriority: z.enum(['minimize_time', 'minimize_cost', 'balance']).optional(),
  includePricing: z.boolean().optional().default(true),
  startFromCurrentLocation: z.boolean().optional().default(false),
  excludeCompletedStops: z.array(z.string()).optional(),
  dispatcherParams: z
    .object({
      dockRestStops: z
        .array(
          z.object({
            stopId: z.string(),
            truckParkedHours: z.number().positive(),
            convertToRest: z.boolean(),
          }),
        )
        .optional(),
      preferredRestType: z.enum(['auto', 'full', 'split_8_2', 'split_7_3']).optional(),
      avoidTollRoads: z.boolean().optional(),
      maxDetourMilesForFuel: z.number().optional(),
    })
    .optional(),
});

// ─── New Schemas for V2 Endpoints ───

export const ReplanRouteInputSchema = z.object({
  reason: z.string().optional(),
});

export const ActivateRouteInputSchema = z.object({
  confirmReassignment: z.boolean().optional().default(false),
});

export const UpdateSegmentStatusSchema = z.object({
  status: RouteSegmentStatusSchema,
  actualArrival: z.string().optional(),
  actualDeparture: z.string().optional(),
});

// ─── Response Types ───

export const HOSStateSchema = z.object({
  hoursDriven: z.number(),
  onDutyTime: z.number(),
  /** On-duty time since last 30-min break — includes dock/loading time. Rarely used directly by the UI. */
  hoursSinceBreak: z.number(),
  /** Driving-only time since last 30-min break — FMCSA §395.3 accumulator. UI "Break" gauges read THIS. */
  drivingHoursSinceBreak: z.number().optional(),
  cycleHoursUsed: z.number(),
  cycleDaysData: z.array(z.object({ date: z.string(), hoursWorked: z.number() })).optional(),
  splitRestState: z
    .object({
      inSplit: z.boolean(),
      firstPortionType: z.enum(['sleeper_7', 'sleeper_8', 'offduty_2', 'offduty_3']).nullable(),
      firstPortionCompleted: z.boolean(),
      pausedDutyWindow: z.number(),
    })
    .optional(),
});

export const WeatherAlertSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  condition: z.string(),
  severity: z.enum(['low', 'moderate', 'severe']),
  description: z.string(),
  temperatureF: z.number(),
  windSpeedMph: z.number(),
  driveTimeMultiplier: z.number(),
});

export const DecisionReasonSchema = z.object({
  summary: z.string(),
  details: z.string(),
  alternativesCount: z.number().optional(),
  trigger: z.string(),
  hosStateAtDecision: z
    .object({
      hoursDriven: z.number(),
      onDutyTime: z.number(),
      hoursSinceBreak: z.number(),
      drivingHoursSinceBreak: z.number().optional(),
      cycleHoursUsed: z.number(),
    })
    .optional(),
});

export const RouteSegmentSchema = z.object({
  segmentId: z.string(),
  sequenceOrder: z.number(),
  segmentType: z.enum(['drive', 'rest', 'fuel', 'dock', 'break', 'wait']),

  // Location
  fromLocation: z.string(),
  toLocation: z.string(),
  fromLat: z.number(),
  fromLon: z.number(),
  toLat: z.number(),
  toLon: z.number(),

  // Timing
  estimatedArrival: z.string(),
  estimatedDeparture: z.string(),
  timezone: z.string().optional(),

  // Drive
  distanceMiles: z.number().optional(),
  driveTimeHours: z.number().optional(),
  routeGeometry: z.string().optional(),

  // Rest
  restDurationHours: z.number().optional(),
  restType: z.string().optional(),
  restReason: z.string().optional(),

  // Dock
  dockDurationHours: z.number().optional(),
  customerName: z.string().optional(),
  actionType: z.string().optional(),
  isDocktimeConverted: z.boolean().optional(),

  // Appointment window (delivery/pickup) + schedule risk at arrival.
  appointmentWindow: z.object({ start: z.string(), end: z.string() }).optional(),
  // Negative = minutes late past the window close; positive = minutes of slack.
  arrivalBufferMinutes: z.number().optional(),

  // Fuel
  fuelGallons: z.number().optional(),
  fuelCostEstimate: z.number().optional(),
  fuelStationName: z.string().optional(),
  fuelPricePerGallon: z.number().optional(),
  detourMiles: z.number().optional(),

  // HOS state after segment
  hosStateAfter: HOSStateSchema.optional(),

  // Fuel state after segment
  fuelStateAfter: z
    .object({
      currentFuelGallons: z.number(),
      fuelCapacityGallons: z.number(),
      rangeRemainingMiles: z.number(),
    })
    .optional(),

  // Status
  status: RouteSegmentStatusSchema.optional(),

  // Decision reasoning
  decisionReason: DecisionReasonSchema.optional(),

  // Weather
  weatherAlerts: z.array(WeatherAlertSchema).optional(),
});

export const CostBreakdownSchema = z.object({
  fuelCost: z.number(),
  laborCost: z.number(),
  tollCost: z.number(),
  // Provenance of tollCost: NOT_AVAILABLE means tollCost is 0 only because no toll
  // feed is connected — the UI must label it, not present a "free" route.
  tollSource: z.enum(['LIVE', 'ESTIMATED', 'NOT_AVAILABLE']).optional(),
  tollNote: z.string().optional(),
  totalOperatingCost: z.number(),
  costPerMile: z.number(),
  laborCostPerHour: z.number(),
});

export const ComplianceReportSchema = z.object({
  isFullyCompliant: z.boolean(),
  totalRestStops: z.number(),
  totalBreaks: z.number(),
  total34hRestarts: z.number(),
  totalSplitRests: z.number(),
  dockTimeConversions: z.number(),
  rules: z.array(
    z.object({
      rule: z.string(),
      status: z.enum(['pass', 'addressed', 'violation']),
      detail: z.string().optional(),
    }),
  ),
});

export const DayBreakdownSchema = z.object({
  day: z.number(),
  date: z.string(),
  driveHours: z.number(),
  onDutyHours: z.number(),
  segments: z.number(),
  restStops: z.number(),
});

export const RoutePlanLoadSchema = z.object({
  id: z.number(),
  load: z.object({
    loadId: z.string(),
    loadNumber: z.string(),
    referenceNumber: z.string().optional(),
    customerName: z.string(),
    commodityType: z.string(),
    weightLbs: z.number(),
    rateCents: z.number().optional(),
    pieces: z.number().optional(),
    requiredEquipmentType: z.string().nullable().optional(),
    status: z.string(),
    stops: z
      .array(
        z.object({
          actionType: z.string(),
          stop: z.object({
            city: z.string(),
            state: z.string(),
          }),
        }),
      )
      .optional(),
  }),
});

/**
 * Per-leg plan data for relay routes. Essentially a full RoutePlanResult
 * but defined separately to avoid circular references in Zod.
 */
export const RoutePlanLegSchema = z.object({
  planId: z.string(),
  status: RoutePlanStatusSchema,
  isFeasible: z.boolean(),
  feasibilityIssues: z.array(z.string()),
  totalDistanceMiles: z.number(),
  totalDriveTimeHours: z.number(),
  totalTripTimeHours: z.number(),
  totalDrivingDays: z.number(),
  totalCostEstimate: z.number(),
  departureTime: z.string(),
  estimatedArrival: z.string(),
  driver: z.object({ driverId: z.string(), name: z.string() }).optional(),
  vehicle: z
    .object({
      vehicleId: z.string(),
      unitNumber: z.string(),
      equipmentType: z.string().optional(),
    })
    .optional(),
  segments: z.array(RouteSegmentSchema),
  complianceReport: ComplianceReportSchema.optional(),
  dailyBreakdown: z.array(DayBreakdownSchema).optional(),
  costBreakdown: CostBreakdownSchema.optional(),
  initialFuelPercent: z.number().optional(),
});

export const RoutePlanResultSchema = z.object({
  planId: z.string(),
  status: RoutePlanStatusSchema,
  isFeasible: z.boolean(),
  feasibilityIssues: z.array(z.string()),
  totalDistanceMiles: z.number(),
  totalDriveTimeHours: z.number(),
  totalTripTimeHours: z.number(),
  totalDrivingDays: z.number(),
  totalCostEstimate: z.number(),
  departureTime: z.string(),
  estimatedArrival: z.string(),
  driver: z.object({ driverId: z.string(), name: z.string() }).optional(),
  vehicle: z
    .object({
      vehicleId: z.string(),
      unitNumber: z.string(),
      equipmentType: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
    })
    .optional(),
  dispatcherParams: z
    .object({
      preferredRestType: z.enum(['auto', 'full', 'split_8_2', 'split_7_3']).optional(),
      avoidTollRoads: z.boolean().optional(),
      maxDetourMilesForFuel: z.number().optional(),
    })
    .optional(),
  optimizationPriority: z.enum(['minimize_time', 'minimize_cost', 'balance']).optional(),
  segments: z.array(RouteSegmentSchema),
  loads: z.array(RoutePlanLoadSchema).optional(),
  complianceReport: ComplianceReportSchema,
  weatherAlerts: z.array(WeatherAlertSchema),
  dailyBreakdown: z.array(DayBreakdownSchema),
  // V3: Cost breakdown
  costBreakdown: CostBreakdownSchema.optional(),
  // V3: Initial fuel state at departure
  initialFuelPercent: z.number().optional(),
  // Provenance of the HOS clocks the plan was built from: LIVE (ELD) vs ESTIMATED (DB fallback).
  hosSource: z.enum(['LIVE', 'ESTIMATED', 'NOT_AVAILABLE']).optional(),
  // V4: Relay route support
  routeType: z.enum(['solo', 'relay']).optional(),
  relayLegs: z
    .array(
      z.object({
        legSequence: z.number(),
        legId: z.string(),
        driverName: z.string().optional(),
        vehicleName: z.string().optional(),
        plan: RoutePlanLegSchema.optional(),
        miles: z.number(),
        schedule: z.string().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
});

export const RoutePlanListItemSchema = z.object({
  id: z.number(),
  planId: z.string(),
  status: z.string(),
  isActive: z.boolean(),
  totalDistanceMiles: z.number(),
  totalDriveTimeHours: z.number(),
  totalTripTimeHours: z.number(),
  totalCostEstimate: z.number(),
  departureTime: z.string(),
  estimatedArrival: z.string(),
  isFeasible: z.boolean(),
  createdAt: z.string(),
  driver: z.object({ driverId: z.string(), name: z.string() }),
  vehicle: z.object({ vehicleId: z.string(), unitNumber: z.string() }),
  loads: z.array(
    z.object({
      load: z.object({
        loadId: z.string(),
        loadNumber: z.string(),
        referenceNumber: z.string().nullable(),
        customerName: z.string(),
      }),
    }),
  ),
  segments: z.array(
    z.object({
      sequenceOrder: z.number(),
      toLocation: z.string(),
      actionType: z.string(),
    }),
  ),
  _count: z.object({ segments: z.number(), loads: z.number() }),
});

export const RoutePlanListResponseSchema = z.object({
  plans: z.array(RoutePlanListItemSchema),
  total: z.number(),
});

/** Result of POST /routes/:planId/preview — totals only, no persisted plan (WhatIf). */
export const RoutePlanPreviewResultSchema = z.object({
  totalDistanceMiles: z.number(),
  totalDriveTimeHours: z.number(),
  totalTripTimeHours: z.number(),
  totalDrivingDays: z.number(),
  totalCostEstimate: z.number(),
  estimatedArrival: z.string(),
  isFeasible: z.boolean(),
  feasibilityIssues: z.array(z.string()),
  costBreakdown: CostBreakdownSchema.optional(),
  complianceReport: ComplianceReportSchema.optional(),
});

// Inferred types
export type CreateRoutePlanInput = z.infer<typeof CreateRoutePlanInputSchema>;
export type HOSState = z.infer<typeof HOSStateSchema>;
export type WeatherAlert = z.infer<typeof WeatherAlertSchema>;
export type RouteSegment = z.infer<typeof RouteSegmentSchema>;
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;
export type DayBreakdown = z.infer<typeof DayBreakdownSchema>;
export type RoutePlanLoad = z.infer<typeof RoutePlanLoadSchema>;
export type RoutePlanLeg = z.infer<typeof RoutePlanLegSchema>;
export type RoutePlanResult = z.infer<typeof RoutePlanResultSchema>;
export type RoutePlanListItem = z.infer<typeof RoutePlanListItemSchema>;
export type RoutePlanListResponse = z.infer<typeof RoutePlanListResponseSchema>;
export type RoutePlanPreviewResult = z.infer<typeof RoutePlanPreviewResultSchema>;

export type ReplanRouteInput = z.infer<typeof ReplanRouteInputSchema>;
export type ActivateRouteInput = z.infer<typeof ActivateRouteInputSchema>;
export type UpdateSegmentStatus = z.infer<typeof UpdateSegmentStatusSchema>;
export type DecisionReason = z.infer<typeof DecisionReasonSchema>;
export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;

// Alias kept for backward compatibility with frontend
export type CreateRoutePlanRequest = CreateRoutePlanInput;
