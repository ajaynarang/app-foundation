/**
 * @jest-environment jsdom
 */
/* global describe, it, expect */
import { forwardRef } from 'react';
import { render, screen } from '@testing-library/react';
import {
  DEFAULT_PAGE_CHROME_ADAPTER,
  Identifier,
  ListErrorState,
  ListRow,
  ListRows,
  PageChromeProvider,
  PageHeader,
  RowActions,
  type PageChromeAdapter,
  type PageChromeLinkProps,
} from '@app/ui/components/page-chrome';

const AppLink = forwardRef<HTMLAnchorElement, PageChromeLinkProps>(function AppLink(props, ref) {
  return <a ref={ref} data-app-link="" {...props} />;
});

const ADAPTER: PageChromeAdapter = {
  ...DEFAULT_PAGE_CHROME_ADAPTER,
  errorMessage: () => 'The app says why.',
  Link: AppLink,
};

describe('the page-chrome adapter (PageChromeProvider)', () => {
  it('works with no provider: plain anchors and a generic error line, never the raw error message', () => {
    render(
      <>
        <Identifier href="/invoices/INV-1">INV-1</Identifier>
        <ListErrorState
          title="Couldn't load."
          error={new Error('prisma: relation "x" does not exist')}
          onRetry={() => {}}
        />
      </>,
    );
    expect(screen.getByText('INV-1').closest('a')?.getAttribute('href')).toBe('/invoices/INV-1');
    expect(screen.queryByText(/prisma/)).toBeNull();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
  });

  it("renders every link through the app's Link and every error through the app's reader", () => {
    render(
      <PageChromeProvider value={ADAPTER}>
        <PageHeader title="Members" subtitle="Who's here" settingsHref="/settings" />
        <Identifier href="/invoices/INV-1">INV-1</Identifier>
        <ListRows>
          <ListRow primary="A row" href="/invoices/INV-2" />
        </ListRows>
        <RowActions primary={{ label: 'Open', href: '/invoices/INV-3' }} />
        <ListErrorState title="Couldn't load." error={new Error('boom')} onRetry={() => {}} />
      </PageChromeProvider>,
    );
    const links = Array.from(document.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href')).sort()).toEqual([
      '/invoices/INV-1',
      '/invoices/INV-2',
      '/invoices/INV-3',
      '/settings',
    ]);
    expect(links.every((a) => a.hasAttribute('data-app-link'))).toBe(true);
    expect(screen.getByText('The app says why.')).toBeTruthy();
  });

  it('the default formatters read a calendar date and an instant, and fall back on bad input', () => {
    expect(DEFAULT_PAGE_CHROME_ADAPTER.formatCalendarDate('2026-02-28', 'MMM d')).toBe('Feb 28');
    expect(DEFAULT_PAGE_CHROME_ADAPTER.formatCalendarDate(undefined)).toBe('—');
    expect(DEFAULT_PAGE_CHROME_ADAPTER.formatCalendarDate('nope')).toBe('—');
    expect(DEFAULT_PAGE_CHROME_ADAPTER.formatTimestamp('not-a-date')).toBe('—');
    expect(DEFAULT_PAGE_CHROME_ADAPTER.formatTimestamp('2026-02-28T15:30:00Z')).toMatch(/^Feb 2[89], 2026, /);
    expect(DEFAULT_PAGE_CHROME_ADAPTER.calendarDateToday('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(DEFAULT_PAGE_CHROME_ADAPTER.calendarDateToday('UTC')).toBe(new Date().toISOString().slice(0, 10));
  });
});
