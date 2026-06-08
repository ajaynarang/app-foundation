// API
export { routePlanningApi } from './api';

// Types
export type {
  CreateRoutePlanRequest,
  RoutePlanResult,
  RouteSegment,
  ComplianceReport,
  WeatherAlert,
  DayBreakdown,
  HOSState,
  RoutePlanLoad,
  RoutePlanLeg,
  RoutePlanListItem,
  RoutePlanListResponse,
  CostBreakdown,
} from './types';

// Hooks — dispatcher
export {
  usePlanRoute,
  useRoutePlans,
  useRoutePlan,
  useActivateRoute,
  useCancelRoute,
  useRoutePlanGeoJSON,
} from './hooks/use-route-planning';

// Hooks — shared (mutations that invalidate both driver + dispatcher caches)
export {
  useDriverActiveRoutePlan,
  useRequestReplan,
  useRequestReplan as useReplanRoute,
  useUpdateSegmentStatus,
} from './hooks/use-driver-route-plan';

// Hooks — geocoding
export { useGeocodeStops } from './hooks/use-geocode-stops';

// Components — shared plan detail
export { PlanDetailPanel } from './components/PlanDetailPanel';
export { PlanHeader } from './components/PlanHeader';
export { SegmentTimeline } from './components/SegmentTimeline';
export { RouteGlance } from './components/RouteGlance';
export { LoadDetails } from './components/LoadDetails';
export { HOSProgressBars, HOSSummary, isHOSMeaningful } from './components/HOSProgressBars';
export { HOSDepartureGauges } from './components/HOSDepartureGauges';
export { WeatherAlertBanner } from './components/WeatherAlertBanner';
export { CostBreakdownPanel } from './components/CostBreakdownPanel';
export { ComplianceSummary } from './components/ComplianceSummary';
export { DecisionReason } from './components/DecisionReason';
export { DecisionFeedback } from './components/DecisionFeedback';
export { WhatIfPanel } from './components/WhatIfPanel';
export { RelayLegTabs } from './components/RelayLegTabs';
export { formatHours, statusVariant, statusBadgeClassName } from './components/plan-utils';

// Hooks — feedback
export { useSubmitFeedback } from './hooks/use-submit-feedback';
