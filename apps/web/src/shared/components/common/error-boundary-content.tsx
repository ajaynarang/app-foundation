'use client';

import { useEffect } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { captureError } from '@/shared/lib/sentry';

interface ErrorBoundaryContentProps {
  error: Error & { digest?: string };
  reset: () => void;
  source: string;
  escapeHref: string;
  escapeLabel: string;
}

/**
 * Shared error boundary layout. Used by all route-segment error.tsx files.
 * Keeps layout/nav alive — only the content area shows the error.
 */
export function ErrorBoundaryContent({ error, reset, source, escapeHref, escapeLabel }: ErrorBoundaryContentProps) {
  useEffect(() => {
    captureError(error, { source });
  }, [error, source]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          We couldn&apos;t load this page. Your data is safe — try again or navigate away.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>Try Again</Button>
          <a
            href={escapeHref}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 border border-input bg-background hover:bg-muted hover:text-foreground transition-colors"
          >
            {escapeLabel}
          </a>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <pre className="mt-6 text-left text-xs text-destructive bg-muted p-4 rounded-md overflow-auto max-h-40">
            {error.message}
            {'\n'}
            {error.stack}
          </pre>
        )}
      </div>
    </div>
  );
}
