'use client';

import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { usePageChrome } from './page-chrome-context';

export interface ListErrorStateProps {
  /** What failed, in the user's words — "Couldn't load the intake queue." */
  title: string;
  /** The query error; its user-safe message (the adapter's `errorMessage`) is shown under the title. */
  error?: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}

/**
 * ListErrorState — a failed list fetch: what went wrong + Retry. A failure must never read
 * as an empty list.
 */
export function ListErrorState({ title, error, onRetry, isRetrying = false, className }: ListErrorStateProps) {
  const { errorMessage } = usePageChrome();
  return (
    <div role="alert" className={cn('rounded-lg border border-destructive/30 p-6 text-center', className)}>
      <p className="text-sm text-destructive">{title}</p>
      {error !== undefined && error !== null && (
        <p className="mt-1 text-xs text-muted-foreground">{errorMessage(error)}</p>
      )}
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry} loading={isRetrying}>
        Retry
      </Button>
    </div>
  );
}
