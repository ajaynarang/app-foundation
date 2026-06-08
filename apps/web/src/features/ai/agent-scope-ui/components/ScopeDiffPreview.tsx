'use client';

import { SCOPE_DESCRIPTIONS } from '@sally/shared-types';
import type { AgentScope } from '@sally/shared-types';
import { ScopeChip } from './ScopeChip';

interface ScopeDiffPreviewProps {
  current: AgentScope[];
  next: AgentScope[];
}

/**
 * Inline scope-edit diff (not a modal).
 * Renders a plain-English list of added/removed scopes sourced from
 * SCOPE_DESCRIPTIONS, so the same copy feeds the developer portal in
 * Phase E.
 */
export function ScopeDiffPreview({ current, next }: ScopeDiffPreviewProps) {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  const added = next.filter((s) => !currentSet.has(s));
  const removed = current.filter((s) => !nextSet.has(s));

  if (added.length === 0 && removed.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm text-foreground">
      {current.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground">Agent currently has:</span>
          {current.map((s) => (
            <ScopeChip key={s} scope={s} />
          ))}
        </div>
      )}
      {added.length > 0 && (
        <>
          <p className="mt-3 font-medium">You’re adding:</p>
          <ul className="mt-1 space-y-2">
            {added.map((s) => (
              <li key={s} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                <ScopeChip scope={s} />
                <span className="text-muted-foreground">{SCOPE_DESCRIPTIONS[s]?.grantsPlainEnglish ?? s}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {removed.length > 0 && (
        <>
          <p className="mt-3 font-medium">You’re removing:</p>
          <ul className="mt-1 space-y-2">
            {removed.map((s) => (
              <li key={s} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                <ScopeChip scope={s} />
                <span className="text-muted-foreground">{SCOPE_DESCRIPTIONS[s]?.summary ?? s}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
