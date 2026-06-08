'use client';

import { CopyButton } from './copy-button';

interface UrlRowProps {
  label: string;
  value: string;
}

export function UrlRow({ label, value }: UrlRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 dark:bg-muted/30 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-mono text-foreground truncate">{value}</p>
      </div>
      <CopyButton value={value} label={label} />
    </div>
  );
}
