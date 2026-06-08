import { SCOPE_DESCRIPTIONS, scopeDomain } from '@app/shared-types';
import type { AgentScope } from '@app/shared-types';

/** Dark-mode-safe Tailwind utility for the scope chip, keyed by HITL tier. */
export function scopeChipClass(scope: AgentScope): string {
  const tier = SCOPE_DESCRIPTIONS[scope]?.hitlTier ?? 'none';
  switch (tier) {
    case 'sensitive':
      return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
    case 'standard':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'none':
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Group scopes by their domain prefix (e.g. "fleet:*"). Stable, sort-friendly. */
export function groupScopesByDomain(scopes: readonly AgentScope[]): Record<string, AgentScope[]> {
  const grouped: Record<string, AgentScope[]> = {};
  for (const s of scopes) {
    const domain = scopeDomain(s);
    if (!grouped[domain]) grouped[domain] = [];
    grouped[domain].push(s);
  }
  return grouped;
}
