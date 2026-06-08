'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityDeepLink {
  entityType: string;
  entityId: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Generic entity deep-link hook.
 *
 * Convention: any page can be opened with `?entityType={type}&entityId={id}`.
 * The hook reads these params, fires `onEntity` **once**, then cleans them
 * from the URL via `router.replace` (no back-button noise, no scroll jump).
 *
 * **IMPORTANT:** `useSearchParams()` requires a `<Suspense>` boundary in the
 * consuming component's parent tree (Next.js 15 App Router requirement).
 * The page-level component or a wrapper must provide this boundary.
 */
export function useEntityDeepLink(onEntity: (link: EntityDeepLink) => void): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const consumedRef = useRef(false);
  // Capture latest callback in a ref so the effect doesn't depend on it.
  // This makes the hook safe regardless of whether the consumer stabilizes
  // the callback with useCallback.
  const onEntityRef = useRef(onEntity);
  onEntityRef.current = onEntity;

  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');

  useEffect(() => {
    if (!entityType || !entityId || consumedRef.current) return;

    consumedRef.current = true;
    onEntityRef.current({ entityType, entityId });

    // Remove deep-link params from URL without triggering navigation
    const url = new URL(window.location.href);
    url.searchParams.delete('entityType');
    url.searchParams.delete('entityId');
    const cleaned = url.pathname + (url.search || '');
    router.replace(cleaned, { scroll: false });
  }, [entityType, entityId, router]);
}
