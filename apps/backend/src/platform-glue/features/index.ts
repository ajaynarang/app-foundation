import type { OptionalFeature } from './optional-feature';
// feature:desk:start
import { DESK_FEATURE } from './desk.feature';
// feature:desk:end

/**
 * The optional features this product kept. `pnpm init-app` asks for each one, and
 * `node tools/init-app/apply-feature.mjs --remove <name>` drops one later: it deletes the feature's line here
 * along with everything its manifest (`tools/init-app/features/<name>.json`) names. This list is the record of the
 * choice; `apps/backend/src/architecture/optional-features.spec.ts` reads it.
 */
export const OPTIONAL_FEATURES: readonly OptionalFeature[] = [
  // feature:desk:start
  DESK_FEATURE,
  // feature:desk:end
];

export type { OptionalFeature } from './optional-feature';
