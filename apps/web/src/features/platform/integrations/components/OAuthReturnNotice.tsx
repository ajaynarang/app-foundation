'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { showError, showSuccess } from '@app/ui';
import { readOAuthReturn, withoutOAuthReturn } from '../oauth-return';

/**
 * Shows the outcome of an integration's OAuth round trip, then removes the
 * result from the URL. Mounted by the Settings layout, so the message appears
 * on whichever Settings screen the backend callback returns to.
 *
 * Reads the query string, so its parent must wrap it in <Suspense>.
 */
export function OAuthReturnNotice() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shown = useRef<string | null>(null);

  useEffect(() => {
    const result = readOAuthReturn(searchParams);
    if (!result) return;

    // One message per return: an effect that runs twice must not toast twice.
    const key = searchParams.toString();
    if (shown.current === key) return;
    shown.current = key;

    if (result.status === 'connected') showSuccess(result.title);
    else showError(result.title, result.description);

    router.replace(withoutOAuthReturn(pathname, new URLSearchParams(key)), { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}
