'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export interface PageEmptyStateProps {
  /** lucide icon component, e.g. `Inbox`. Optional. */
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  /** Optional CTA — pass a <Button>. */
  action?: ReactNode;
  className?: string;
}

/**
 * PageEmptyState — consistent empty state for the data zone. Centered, muted, with an
 * optional icon, description, and CTA. See sally-frontend-patterns §16 (Page Chrome).
 */
export function PageEmptyState({ icon: Icon, title, description, action, className }: PageEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-center', className)}>
      {Icon && <Icon className="mb-1 h-8 w-8 text-muted-foreground/60" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
