'use client';

import { cn } from '@sally/ui';

interface WireActionBarProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Action row appended below a wire item body. Keeps spacing consistent
 * across the alert / message / desk / ops variants.
 */
export function WireActionBar({ children, className }: WireActionBarProps) {
  return <div className={cn('mt-1.5 flex flex-wrap items-center gap-1.5', className)}>{children}</div>;
}
