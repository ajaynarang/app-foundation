'use client';

import { ErrorBoundaryContent } from '@/shared/components/common/error-boundary-content';

export default function CustomerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryContent
      error={error}
      reset={reset}
      source="customer-error"
      escapeHref="/customer/dashboard"
      escapeLabel="Go to Dashboard"
    />
  );
}
