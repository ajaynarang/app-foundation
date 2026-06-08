'use client';

import { ErrorBoundaryContent } from '@/shared/components/common/error-boundary-content';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryContent error={error} reset={reset} source="app-error" escapeHref="/" escapeLabel="Go to Dashboard" />
  );
}
