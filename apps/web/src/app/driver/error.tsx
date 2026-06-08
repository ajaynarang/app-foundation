'use client';

import { ErrorBoundaryContent } from '@/shared/components/common/error-boundary-content';

export default function DriverError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryContent
      error={error}
      reset={reset}
      source="driver-error"
      escapeHref="/driver/home"
      escapeLabel="Go to Home"
    />
  );
}
