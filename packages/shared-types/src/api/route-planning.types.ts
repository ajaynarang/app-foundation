import { z } from 'zod';

export const StopInputSchema = z.object({
  stopId: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  locationType: z.enum(['warehouse', 'customer', 'distribution_center', 'truck_stop', 'service_area', 'fuel_station']),
  isOrigin: z.boolean().default(false),
  isDestination: z.boolean().default(false),
  earliestArrival: z.string().optional(),
  latestArrival: z.string().optional(),
  estimatedDockHours: z.number().min(0).default(0.0),
  customerName: z.string().optional(),
});

export type StopInput = z.infer<typeof StopInputSchema>;

export const DriverStateInputSchema = z.object({
  hoursDriven: z.number().min(0).max(11),
  onDutyTime: z.number().min(0).max(14),
  hoursSinceBreak: z.number().min(0).max(8),
});

export type DriverStateInput = z.infer<typeof DriverStateInputSchema>;

export const VehicleStateInputSchema = z.object({
  fuelCapacityGallons: z.number().positive(),
  currentFuelGallons: z.number().min(0),
  mpg: z.number().positive(),
});

export type VehicleStateInput = z.infer<typeof VehicleStateInputSchema>;

export const RoutePlanningRequestSchema = z.object({
  driverId: z.string().min(1),
  vehicleId: z.string().min(1),
  driverState: DriverStateInputSchema,
  vehicleState: VehicleStateInputSchema,
  stops: z.array(StopInputSchema).min(2),
  optimizationPriority: z.enum(['minimize_time', 'minimize_cost', 'balance']).default('minimize_time'),
  driverPreferences: z
    .object({
      preferredRestDuration: z.number().min(7).max(10).default(10),
      avoidNightDriving: z.boolean().default(false),
    })
    .optional(),
});

export type RoutePlanningRequest = z.infer<typeof RoutePlanningRequestSchema>;

export const RouteUpdateRequestSchema = z.object({
  planId: z.string().min(1),
  updateType: z.enum([
    'traffic_delay',
    'dock_time_change',
    'load_added',
    'load_cancelled',
    'driver_rest_request',
    'hos_violation',
  ]),
  updateData: z.record(z.string(), z.unknown()).optional(),
  segmentId: z.string().optional(),
  delayMinutes: z.number().optional(),
  actualDockHours: z.number().optional(),
  newStop: StopInputSchema.optional(),
  cancelledStopId: z.string().optional(),
  restLocation: z.record(z.string(), z.unknown()).optional(),
  triggeredBy: z.string().default('system'),
});

export type RouteUpdateRequest = z.infer<typeof RouteUpdateRequestSchema>;

export interface RouteSegmentResponse {
  sequenceOrder: number;
  segmentType: string;
  fromLocation: string | null;
  toLocation: string | null;
  distanceMiles: number | null;
  driveTimeHours: number | null;
  restType: string | null;
  restDurationHours: number | null;
  restReason: string | null;
  fuelGallons: number | null;
  fuelCostEstimate: number | null;
  fuelStationName: string | null;
  dockDurationHours: number | null;
  customerName: string | null;
  hosStateAfter: Record<string, number> | null;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
}

export interface ComplianceReportResponse {
  maxDriveHoursUsed: number;
  maxDutyHoursUsed: number;
  breaksRequired: number;
  breaksPlanned: number;
  violations: string[];
}

export interface RestStopInfo {
  location: string;
  type: string;
  durationHours: number;
  reason: string;
}

export interface FuelStopInfo {
  location: string;
  gallons: number;
  cost: number;
}

export interface RouteSummary {
  totalDrivingSegments: number;
  totalRestStops: number;
  totalFuelStops: number;
  totalDockStops: number;
  estimatedCompletion: string | null;
}

export interface RoutePlanningResponse {
  planId: string;
  planVersion: number;
  isFeasible: boolean;
  feasibilityIssues: string[];
  optimizedSequence: string[];
  segments: RouteSegmentResponse[];
  totalDistanceMiles: number;
  totalTimeHours: number;
  totalCostEstimate: number;
  restStops: RestStopInfo[];
  fuelStops: FuelStopInfo[];
  summary: RouteSummary;
  complianceReport: ComplianceReportResponse;
  dataSources: Record<string, { label: string; color: string; tooltip: string }>;
}

export interface RouteUpdateResponse {
  updateId: string;
  planId: string;
  replanTriggered: boolean;
  newPlan?: RoutePlanningResponse;
  impactSummary: Record<string, unknown>;
}

export const TriggerInputSchema = z.object({
  triggerType: z.string().min(1),
  segmentId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type TriggerInput = z.infer<typeof TriggerInputSchema>;

export interface SimulationResult {
  previousPlanVersion: number;
  newPlanVersion: number;
  newPlanId: string;
  triggersApplied: number;
  impactSummary: Record<string, unknown>;
  replanTriggered: boolean;
  replanReason: string | null;
}
