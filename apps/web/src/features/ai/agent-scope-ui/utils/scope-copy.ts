import { SCOPE_DESCRIPTIONS, scopeDomain } from '@app/shared-types';
import type { AgentScope } from '@app/shared-types';
import { toneBadgeClass, type StatusVariant } from '@app/ui';

export type HitlTier = 'none' | 'standard' | 'sensitive';

/**
 * The approval tier a scope carries, as a tone: a read needs nothing (neutral), a write runs (info), a sensitive
 * scope waits on a person's approval (warning). ui-grammar-guard.test.ts holds the tones.
 */
export const HITL_TIER_VARIANTS: Record<HitlTier, StatusVariant> = {
  none: { label: 'No approval', tone: 'neutral' },
  standard: { label: 'Standard', tone: 'info' },
  sensitive: { label: 'Sensitive', tone: 'warning' },
};

/** An API key or an OAuth client: on, paused by its owner, or revoked for good. */
export const CREDENTIAL_STATUS_VARIANTS: Record<'ACTIVE' | 'PAUSED' | 'REVOKED', StatusVariant> = {
  ACTIVE: { label: 'Active', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  REVOKED: { label: 'Revoked', tone: 'danger' },
};

export function credentialStatus(credential: { isActive: boolean; revokedAt?: string | null }): StatusVariant {
  if (credential.revokedAt) return CREDENTIAL_STATUS_VARIANTS.REVOKED;
  return CREDENTIAL_STATUS_VARIANTS[credential.isActive ? 'ACTIVE' : 'PAUSED'];
}

/** The tone classes for a scope chip, keyed by the scope's HITL tier. */
export function scopeChipClass(scope: AgentScope): string {
  const tier: HitlTier = SCOPE_DESCRIPTIONS[scope]?.hitlTier ?? 'none';
  return toneBadgeClass(HITL_TIER_VARIANTS[tier].tone);
}

/** Group scopes by their domain prefix (e.g. "documents:*"). Stable, sort-friendly. */
export function groupScopesByDomain(scopes: readonly AgentScope[]): Record<string, AgentScope[]> {
  const grouped: Record<string, AgentScope[]> = {};
  for (const s of scopes) {
    const domain = scopeDomain(s);
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(s);
  }
  return grouped;
}
