'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { PageChromeProvider, type PageChromeAdapter } from '@app/ui/components/page-chrome';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';
import { calendarDateToday } from '@appshore/web-core/shared/lib/utils/date-utils';
import { useFormatters } from './PreferencesProvider';

/**
 * Hands the shared page chrome what it needs from apps/web: the user's timezone and formatters (PreferencesProvider),
 * the API error reader and `next/link`. Sits inside PreferencesProvider.
 */
export function PageChromeBridge({ children }: { children: ReactNode }) {
  const { timezone, formatTimestamp, formatCalendarDate } = useFormatters();
  const adapter = useMemo<PageChromeAdapter>(
    () => ({
      timezone,
      formatTimestamp: (iso) => formatTimestamp(iso),
      formatCalendarDate,
      calendarDateToday,
      errorMessage: extractErrorMessage,
      Link,
    }),
    [timezone, formatTimestamp, formatCalendarDate],
  );
  return <PageChromeProvider value={adapter}>{children}</PageChromeProvider>;
}
