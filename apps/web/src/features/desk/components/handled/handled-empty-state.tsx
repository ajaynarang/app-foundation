'use client';

import type { EmptyStateVariant } from '../../lib/handled-empty-state-variant';

/**
 * Dark-mode safe empty state for the Handled tab. Copy is driven by the
 * variant chosen in `handled-empty-state-variant.ts` — this component
 * stays pure so the variant logic can be tested independently.
 */
const COPY: Record<EmptyStateVariant, string> = {
  morning: "Quiet morning. Sally's working — check back after lunch.",
  afternoon: 'Nothing closed today yet.',
  new_tenant: "Sally's just getting started. She'll have work to show you as she handles things.",
  general: 'Nothing closed in this window. Try expanding the range or switching scope.',
};

export function HandledEmptyState({ variant }: { variant: EmptyStateVariant }) {
  return (
    <section
      aria-label="No handled episodes"
      className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center"
    >
      <p className="text-sm text-muted-foreground">{COPY[variant]}</p>
    </section>
  );
}
