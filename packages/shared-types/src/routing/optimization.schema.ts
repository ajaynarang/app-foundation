import { z } from 'zod';

export const OptimizationRestRecommendationSchema = z.enum(['full_rest', 'partial_rest', 'no_rest']);
export const OptimizationComplianceStatusSchema = z.enum(['COMPLIANT', 'NON_COMPLIANT', 'WARNING']);

export const HOSComplianceCheckSchema = z.object({
  ruleName: z.string(),
  isCompliant: z.boolean(),
  currentValue: z.number(),
  limitValue: z.number(),
  remaining: z.number(),
  message: z.string(),
});

export const HOSCheckResultSchema = z.object({
  status: OptimizationComplianceStatusSchema,
  isCompliant: z.boolean(),
  checks: z.array(HOSComplianceCheckSchema),
  warnings: z.array(z.string()),
  violations: z.array(z.string()),
  hoursRemainingToDrive: z.number(),
  hoursRemainingOnDuty: z.number(),
  breakRequired: z.boolean(),
  restRequired: z.boolean(),
});

export const RouteFeasibilityAnalysisSchema = z.object({
  feasible: z.boolean(),
  limitingFactor: z.string().optional(),
  shortfallHours: z.number(),
  totalDriveNeeded: z.number(),
  totalOnDutyNeeded: z.number(),
  driveMargin: z.number(),
  dutyMargin: z.number(),
});

export const RouteOpportunityAnalysisSchema = z.object({
  score: z.number(),
  dockScore: z.number(),
  hoursScore: z.number(),
  criticalityScore: z.number(),
  hoursGainable: z.number(),
});

export const RouteCostAnalysisSchema = z.object({
  dockTimeAvailable: z.number(),
  fullRestExtensionHours: z.number(),
  partialRestExtensionHours: z.number(),
});

export const RestRecommendationRequestSchema = z.object({
  driverId: z.string(),
  hoursDriven: z.number(),
  onDutyTime: z.number(),
  hoursSinceBreak: z.number(),
  dockDurationHours: z.number().optional(),
  dockLocation: z.string().optional(),
  remainingDistanceMiles: z.number().optional(),
  destination: z.string().optional(),
  appointmentTime: z.string().optional(),
  currentLocation: z.string().optional(),
});

export const RestRecommendationResponseSchema = z.object({
  recommendation: OptimizationRestRecommendationSchema,
  recommendedDurationHours: z.number().nullable(),
  reasoning: z.string(),
  isCompliant: z.boolean(),
  complianceDetails: z.string(),
  hoursRemainingToDrive: z.number(),
  hoursRemainingOnDuty: z.number(),
  postLoadDriveFeasible: z.boolean(),
  confidence: z.number().optional(),
  driverCanDecline: z.boolean().optional(),
  hoursAfterRestDrive: z.number().optional(),
  hoursAfterRestDuty: z.number().optional(),
  feasibilityAnalysis: RouteFeasibilityAnalysisSchema.optional(),
  opportunityAnalysis: RouteOpportunityAnalysisSchema.optional(),
  costAnalysis: RouteCostAnalysisSchema.optional(),
});

// Inferred types
export type OptimizationRestRecommendation = z.infer<typeof OptimizationRestRecommendationSchema>;
export type OptimizationComplianceStatus = z.infer<typeof OptimizationComplianceStatusSchema>;
export type HOSComplianceCheck = z.infer<typeof HOSComplianceCheckSchema>;
export type HOSCheckResult = z.infer<typeof HOSCheckResultSchema>;
export type RouteFeasibilityAnalysis = z.infer<typeof RouteFeasibilityAnalysisSchema>;
export type RouteOpportunityAnalysis = z.infer<typeof RouteOpportunityAnalysisSchema>;
export type RouteCostAnalysis = z.infer<typeof RouteCostAnalysisSchema>;
export type RestRecommendationRequest = z.infer<typeof RestRecommendationRequestSchema>;
export type RestRecommendationResponse = z.infer<typeof RestRecommendationResponseSchema>;

// Aliases for backwards compatibility
export type OptimizationResult = RestRecommendationResponse;
export type FeasibilityAnalysis = RouteFeasibilityAnalysis;
export type OpportunityAnalysis = RouteOpportunityAnalysis;
export type CostAnalysis = RouteCostAnalysis;
