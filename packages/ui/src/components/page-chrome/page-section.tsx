'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface PageSectionProps {
  /** The section's name (an h2). */
  title: string;
  /** One muted line under the name — what this section is for. */
  description?: ReactNode;
  /** The section's one action, right of the heading (a small Button). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * PageSection — a named section inside a page (settings pages stack several). The page's h1 is
 * `PageHeader`'s; every section heading below it is this h2, so no page hand-rolls a heading.
 */
export function PageSection({ title, description, action, children, className }: PageSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn('space-y-4', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-semibold text-foreground">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}
