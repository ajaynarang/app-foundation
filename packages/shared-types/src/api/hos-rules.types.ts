import { z } from 'zod';

export const HOSCheckRequestSchema = z.object({
  driverId: z.string().min(1),
  hoursDriven: z.number().min(0).max(24),
  onDutyTime: z.number().min(0).max(24),
  hoursSinceBreak: z.number().min(0).max(24),
  lastRestPeriod: z.number().min(0).optional(),
});

export type HOSCheckRequest = z.infer<typeof HOSCheckRequestSchema>;

export interface ComplianceCheck {
  ruleName: string;
  isCompliant: boolean;
  currentValue: number;
  limitValue: number;
  remaining: number;
  message: string;
}

export interface HOSCheckResponse {
  status: string;
  isCompliant: boolean;
  checks: ComplianceCheck[];
  warnings: string[];
  violations: string[];
  hoursRemainingToDrive: number;
  hoursRemainingOnDuty: number;
  breakRequired: boolean;
  restRequired: boolean;
}

export const OptimizationRequestSchema = z.object({
  driverId: z.string().min(1),
  hoursDriven: z.number().min(0).max(24),
  onDutyTime: z.number().min(0).max(24),
  hoursSinceBreak: z.number().min(0).max(24),
  dockDurationHours: z.number().min(0).optional(),
  dockLocation: z.string().optional(),
  remainingDistanceMiles: z.number().min(0).optional(),
  destination: z.string().optional(),
  appointmentTime: z.string().datetime().optional(),
  upcomingTrips: z
    .array(
      z.object({
        driveTime: z.number().min(0).max(24),
        dockTime: z.number().min(0).max(24),
        location: z.string().optional(),
      }),
    )
    .optional(),
  currentLocation: z.string().optional(),
});

export type OptimizationRequest = z.infer<typeof OptimizationRequestSchema>;

export interface FeasibilityAnalysisResponse {
  feasible: boolean;
  limitingFactor: string | null;
  shortfallHours: number;
  totalDriveNeeded: number;
  totalOnDutyNeeded: number;
  willNeedBreak: boolean;
  driveMargin: number;
  dutyMargin: number;
}

export interface OpportunityAnalysisResponse {
  score: number;
  dockScore: number;
  hoursScore: number;
  criticalityScore: number;
  dockTimeAvailable: number;
  hoursGainable: number;
}

export interface CostAnalysisResponse {
  fullRestExtensionHours: number;
  partialRestExtensionHours: number;
  dockTimeAvailable: number;
}

export interface OptimizationResponse {
  recommendation: string;
  recommendedDurationHours: number | null;
  reasoning: string;
  confidence: number;
  isCompliant: boolean;
  complianceDetails: string;
  hoursRemainingToDrive: number;
  hoursRemainingOnDuty: number;
  postLoadDriveFeasible: boolean;
  driverCanDecline: boolean;
  feasibilityAnalysis: FeasibilityAnalysisResponse | null;
  opportunityAnalysis: OpportunityAnalysisResponse | null;
  costAnalysis: CostAnalysisResponse | null;
  hoursAfterRestDrive: number | null;
  hoursAfterRestDuty: number | null;
}

export const PredictionRequestSchema = z.object({
  remainingDistanceMiles: z.number().positive(),
  destination: z.string().min(1),
  appointmentTime: z.string().datetime().optional(),
  currentLocation: z.string().optional(),
  averageSpeedMph: z.number().positive().max(100).default(55.0),
});

export type PredictionRequest = z.infer<typeof PredictionRequestSchema>;

export interface PredictionResponse {
  estimatedDriveHours: number;
  estimatedArrivalTime: string | null;
  isHighDemand: boolean;
  isLowDemand: boolean;
  confidence: number;
  reasoning: string;
}
