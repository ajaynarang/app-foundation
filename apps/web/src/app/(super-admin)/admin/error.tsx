'use client';

import { ErrorBoundaryContent } from '@/shared/components/common/error-boundary-content';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundaryContent
      error={error}
      reset={reset}
      source="admin-error"
      escapeHref="/admin/tenants"
      escapeLabel="Go to Tenants"
    />
  );
}
