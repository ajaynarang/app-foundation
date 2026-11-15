'use client';

import {
  createContext,
  forwardRef,
  useContext,
  type AnchorHTMLAttributes,
  type ReactNode,
  type RefAttributes,
} from 'react';
import { format } from 'date-fns';
import { parseCalendarDate } from '../../lib/calendar-date';

/** What the kit hands a link: an anchor's props with a required `href`. `next/link` satisfies it. */
export type PageChromeLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  children?: ReactNode;
};
/** A call signature, not a component class: `next/link` (whose `href` also takes a URL object) fits it as is. */
export type PageChromeLink = (props: PageChromeLinkProps & RefAttributes<HTMLAnchorElement>) => ReactNode;

/**
 * PageChromeAdapter — what the page chrome needs from the app that renders it. `@app/ui` never imports app code,
 * web-core or a router, so the app passes these once through `<PageChromeProvider>` (apps/web: the user's
 * preferences + `next/link`).
 */
export interface PageChromeAdapter {
  /** The user's IANA timezone — the zone a date range's days become instants in. */
  timezone: string;
  /** An instant, in full, in the user's timezone and clock ("Oct 6, 2026, 7:55 AM") — the hover on `RelativeTime`. */
  formatTimestamp: (iso: string) => string;
  /** A calendar date (`YYYY-MM-DD`) in a display format (`MMM d`). */
  formatCalendarDate: (date: string | null | undefined, fmt?: string) => string;
  /** Today's calendar date in `timezone` — never the browser's local date when the instants use another zone. */
  calendarDateToday: (timezone: string) => string;
  /** A user-safe line for a failed request (`ListErrorState`). Never a raw stack or Prisma message. */
  errorMessage: (error: unknown) => string;
  /** The app's link component (prefetch, client-side navigation). */
  Link: PageChromeLink;
}

const DefaultLink = forwardRef<HTMLAnchorElement, PageChromeLinkProps>(function DefaultLink(props, ref) {
  return <a ref={ref} {...props} />;
});

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Today in a timezone via Intl (`en-CA` formats as `YYYY-MM-DD`). */
function intlCalendarDateToday(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * Works with no provider: the browser's timezone and local clock, a plain `<a>`, and a generic error line (a raw
 * `error.message` can carry internals, so the default never shows one).
 */
export const DEFAULT_PAGE_CHROME_ADAPTER: PageChromeAdapter = {
  timezone: browserTimezone(),
  formatTimestamp: (iso) => {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? '—' : format(at, 'MMM d, yyyy, h:mm a');
  },
  formatCalendarDate: (date, fmt = 'MMM d, yyyy') => {
    if (!date) return '—';
    const { year, month, day } = parseCalendarDate(date);
    if ([year, month, day].some(Number.isNaN)) return '—';
    return format(new Date(year, month - 1, day), fmt);
  },
  calendarDateToday: intlCalendarDateToday,
  errorMessage: () => 'Something went wrong. Please try again.',
  Link: DefaultLink,
};

const PageChromeContext = createContext<PageChromeAdapter>(DEFAULT_PAGE_CHROME_ADAPTER);

export interface PageChromeProviderProps {
  /** Pass a memoised object — a new one each render re-renders every chrome consumer. */
  value: PageChromeAdapter;
  children: ReactNode;
}

export function PageChromeProvider({ value, children }: PageChromeProviderProps) {
  return <PageChromeContext.Provider value={value}>{children}</PageChromeContext.Provider>;
}

/** The adapter the nearest `PageChromeProvider` passed, or the defaults. */
export function usePageChrome(): PageChromeAdapter {
  return useContext(PageChromeContext);
}
