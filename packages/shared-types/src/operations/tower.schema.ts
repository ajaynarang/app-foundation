import { z } from 'zod';

export const RISK_BAND_VALUES = ['on-track', 'at-risk', 'critical'] as const;
export const RiskBandSchema = z.enum(RISK_BAND_VALUES);
export type RiskBand = z.infer<typeof RiskBandSchema>;

export const RiskScoreSchema = z.object({
  loadId: z.string(),
  driverId: z.string(),
  score: z.number().int().min(0).max(100),
  band: RiskBandSchema,
});
export type RiskScore = z.infer<typeof RiskScoreSchema>;

export const LookaheadHoursSchema = z.union([z.literal(2), z.literal(4), z.literal(8), z.literal('shift')]);
export type LookaheadHours = z.infer<typeof LookaheadHoursSchema>;

export const WireKindSchema = z.enum(['alert', 'message', 'desk', 'ops']);
export type WireKind = z.infer<typeof WireKindSchema>;

export const WireSeveritySchema = z.enum(['critical', 'caution', 'info']);
export type WireSeverity = z.infer<typeof WireSeveritySchema>;

export const WireActionSchema = z.object({
  kind: z.enum(['open-load', 'open-conversation', 'reply', 'mute', 'open-desk', 'accept-desk', 'decline-desk']),
  label: z.string(),
  payload: z.record(z.unknown()).optional(),
});
export type WireAction = z.infer<typeof WireActionSchema>;

export const DeskAnchorSchema = z.object({
  responsibilityType: z.string(),
  episodeId: z.string(),
});
export type DeskAnchor = z.infer<typeof DeskAnchorSchema>;

export const WireItemSchema = z.object({
  id: z.string(),
  kind: WireKindSchema,
  severity: WireSeveritySchema,
  text: z.string(),
  timestamp: z.string(),
  relatedLoadId: z.string().optional(),
  /** The related load's customer reference / PO number — pair with
   *  `relatedLoadId` via `formatLoadLabel` when displaying the load. */
  relatedLoadReference: z.string().optional(),
  relatedDriverId: z.string().optional(),
  /** Driver display name — shown on the wire item for at-a-glance context. */
  relatedDriverName: z.string().optional(),
  deskAnchor: DeskAnchorSchema.optional(),
  actions: z.array(WireActionSchema).optional(),
});
export type WireItem = z.infer<typeof WireItemSchema>;

export const ActiveLoadStopSchema = z.object({
  stopId: z.string(),
  kind: z.enum(['pickup', 'delivery']),
  customerName: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  appointmentAt: z.string().nullable(),
  arrivedAt: z.string().nullable(),
});
export type ActiveLoadStop = z.infer<typeof ActiveLoadStopSchema>;

/**
 * Hours-of-Service snapshot — the four FMCSA clocks a dispatcher needs.
 * Any clock running out strands a load, so all four travel together.
 *  - drive  : 11-hour driving limit
 *  - duty   : 14-hour on-duty / shift window
 *  - cycle  : 60/70-hour weekly limit
 *  - break  : minutes until the mandatory 30-minute break is due
 */
export const ActiveLoadHosSchema = z.object({
  driveMinutesRemaining: z.number().int(),
  dutyMinutesRemaining: z.number().int(),
  cycleMinutesRemaining: z.number().int(),
  breakMinutesRemaining: z.number().int().nullable(),
  isEldConnected: z.boolean(),
  lastSyncAt: z.string().nullable(),
});
export type ActiveLoadHos = z.infer<typeof ActiveLoadHosSchema>;

export const ActiveLoadAssignmentStateSchema = z.enum(['assigned', 'rolling']);
export type ActiveLoadAssignmentState = z.infer<typeof ActiveLoadAssignmentStateSchema>;

export const ActiveLoadViewSchema = z.object({
  loadId: z.string(),
  loadNumber: z.string(),
  /** Customer's reference / PO number — always shown alongside the load number. */
  referenceNumber: z.string().nullable(),
  customerName: z.string().nullable(),
  driver: z.object({
    driverId: z.string(),
    name: z.string(),
    initials: z.string(),
  }),
  vehicleIdentifier: z.string().nullable(),
  currentStop: ActiveLoadStopSchema.nullable(),
  nextStop: ActiveLoadStopSchema.nullable(),
  etaAt: z.string().nullable(),
  slackMinutes: z.number().int().nullable(),
  assignmentState: ActiveLoadAssignmentStateSchema,
  hos: ActiveLoadHosSchema.nullable(),
});
export type ActiveLoadView = z.infer<typeof ActiveLoadViewSchema>;
