export type {
  OptimizationRestRecommendation,
  OptimizationComplianceStatus,
  HOSComplianceCheck,
  HOSCheckResult,
  FeasibilityAnalysis,
  OpportunityAnalysis,
  CostAnalysis,
  RestRecommendationRequest,
  RestRecommendationResponse,
  OptimizationResult,
} from '@sally/shared-types';

// Re-export with original names for backward compatibility
export type {
  OptimizationRestRecommendation as RestRecommendation,
  OptimizationComplianceStatus as ComplianceStatus,
  HOSComplianceCheck as ComplianceCheck,
} from '@sally/shared-types';
