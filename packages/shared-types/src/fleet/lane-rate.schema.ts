import { z } from 'zod';

// ── Enums ──

export const LaneRateConfidenceSchema = z.enum(['high', 'low', 'none']);
export type LaneRateConfidence = z.infer<typeof LaneRateConfidenceSchema>;

export const LaneRateTrendSchema = z.enum(['up', 'down', 'flat']);
export type LaneRateTrend = z.infer<typeof LaneRateTrendSchema>;

// ── Computed lane rate (from historical loads) ──

export const ComputedLaneRateSchema = z.object({
  avgRateCentsPerMile: z.number(),
  minRateCentsPerMile: z.number(),
  maxRateCentsPerMile: z.number(),
  loadCount: z.number().int(),
  confidence: LaneRateConfidenceSchema,
  trend: LaneRateTrendSchema,
});
export type ComputedLaneRate = z.infer<typeof ComputedLaneRateSchema>;

// ── Lane target (dispatcher-set minimum rate) ──

export const LaneRateTargetSchema = z.object({
  laneRateTargetId: z.string(),
  originState: z.string().length(2),
  destinationState: z.string().length(2),
  targetRateCentsPerMile: z.number().int().min(1).max(9999999),
  notes: z.string().max(500).nullable().optional(),
  equipmentType: z.string(),
  setByUserName: z.string(),
  updatedAt: z.string(),
});
export type LaneRateTarget = z.infer<typeof LaneRateTargetSchema>;

// ── Upsert input ──

export const UpsertLaneRateTargetSchema = z.object({
  originState: z.string().length(2),
  destinationState: z.string().length(2),
  targetRateCentsPerMile: z.number().int().min(1).max(9999999),
  notes: z.string().max(500).optional(),
  equipmentType: z.string().optional(),
});
export type UpsertLaneRateTargetInput = z.infer<typeof UpsertLaneRateTargetSchema>;

// ── Combined response ──

export const LaneIntelligenceSchema = z.object({
  computed: ComputedLaneRateSchema.nullable(),
  target: LaneRateTargetSchema.nullable(),
});
export type LaneIntelligence = z.infer<typeof LaneIntelligenceSchema>;
