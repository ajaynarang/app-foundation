'use client';

import { cn } from '@/shared/lib/utils';

interface Flag {
  variant: 'info' | 'warn' | 'critical';
  text: string;
}

/**
 * Flag strip rendered at the bottom of an artifact card. Deliberately
 * shared so every artifact renderer looks identical at its footer.
 * Returns null when there are no flags to render.
 */
export function ArtifactFlags({ flags }: { flags: Flag[] | undefined }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
      {flags.map((flag, i) => (
        <span
          key={i}
          className={cn(
            'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium',
            flag.variant === 'critical' && 'bg-destructive/10 text-destructive',
            flag.variant === 'warn' && 'bg-caution/10 text-caution',
            flag.variant === 'info' && 'bg-muted text-muted-foreground',
          )}
        >
          {flag.text}
        </span>
      ))}
    </div>
  );
}
