import { SetMetadata } from '@nestjs/common';

export const NO_FEATURE_GATE_KEY = 'noFeatureGate';

/**
 * Opt one route OUT of its controller's `@RequireFeature` gate.
 *
 * Its own metadata key, on purpose. `SetMetadata(FEATURE_KEY, undefined)` does not work: `getAllAndOverride` treats
 * an undefined handler value as "not set" and falls through to the class gate, so the route stays gated while
 * looking open. `PlanGuard` checks this key first, and reads it from the handler only: a controller cannot opt its
 * whole surface out in one line.
 *
 * Use it sparingly, for a front door (a summary of what the tenant already owns), never for new capability.
 */
export const NoFeatureGate = () => SetMetadata(NO_FEATURE_GATE_KEY, true);
