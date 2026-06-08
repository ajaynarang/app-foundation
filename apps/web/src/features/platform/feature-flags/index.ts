// API
export { featureFlagsApi, fetchAllFeatureFlags, fetchFeatureFlag, checkFeatureEnabled, updateFeatureFlag } from './api';

// Types
export type { FeatureFlag, FeatureFlagsResponse, FeatureFlagEnabledResponse } from './types';

// Hooks - React Query based
export {
  useFeatureFlags,
  useFeatureFlag,
  useFeatureFlagEnabled,
  useUpdateFeatureFlag,
} from './hooks/use-feature-flags';

// Components
export { default as ComingSoonBanner } from './components/ComingSoonBanner';
export type { ComingSoonBannerProps } from './components/ComingSoonBanner';
export { default as FeatureGuard } from './components/FeatureGuard';
