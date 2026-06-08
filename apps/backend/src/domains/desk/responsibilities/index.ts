import type { ResponsibilityKey } from '@app/shared-types';

import { AR_FOLLOWUP_DEFINITION } from './ar-followup/definition';
import { CLOSEOUT_REVIEW_DEFINITION } from './closeout-review/definition';
import { COMING_SOON_RESPONSIBILITIES } from './coming-soon';
import type { ResponsibilityDefinition } from './definition.types';
import { DOCUMENT_EXPIRY_DEFINITION } from './document-expiry/definition';
import { SETTLEMENT_REVIEW_DEFINITION } from './settlement-review/definition';

/**
 * Responsibility registry. Code-authored; not user-editable. Seeded into
 * desk_responsibilities rows per tenant (see seeds/).
 *
 * Order matters for UI — index order = card order on /dispatcher/desk.
 */
export const RESPONSIBILITY_REGISTRY: readonly ResponsibilityDefinition[] = [
  AR_FOLLOWUP_DEFINITION,
  CLOSEOUT_REVIEW_DEFINITION,
  DOCUMENT_EXPIRY_DEFINITION,
  SETTLEMENT_REVIEW_DEFINITION,
  ...COMING_SOON_RESPONSIBILITIES,
] as const;

export function findResponsibilityDefinition(key: string): ResponsibilityDefinition | undefined {
  return RESPONSIBILITY_REGISTRY.find((r) => r.key === key);
}

export function responsibilityKeys(): ResponsibilityKey[] {
  return RESPONSIBILITY_REGISTRY.map((r) => r.key);
}

export * from './definition.types';
export { AR_FOLLOWUP_DEFINITION } from './ar-followup/definition';
export { CLOSEOUT_REVIEW_DEFINITION } from './closeout-review/definition';
export { DOCUMENT_EXPIRY_DEFINITION } from './document-expiry/definition';
export { SETTLEMENT_REVIEW_DEFINITION } from './settlement-review/definition';
export { COMING_SOON_RESPONSIBILITIES } from './coming-soon';
