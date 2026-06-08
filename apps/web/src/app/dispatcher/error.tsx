'use client';

import { ErrorBoundaryContent } from '@/shared/components/common/error-boundary-content';

export default function DispatcherError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryContent
      error={error}
      reset={reset}
      source="dispatcher-error"
      escapeHref="/dispatcher/loads"
      escapeLabel="Go to Loads"
    />
  );
}
