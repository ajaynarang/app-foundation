/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_PAGE_CHROME_ADAPTER,
  PageChromeProvider,
  type PageChromeAdapter,
} from '@app/ui/components/page-chrome';
import { useLocalListParams } from '@appshore/web-core/shared/list/use-list-params';
import type { ListParamsConfig } from '@appshore/web-core/shared/list/list-params';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/settings/webhooks',
  useSearchParams: () => new URLSearchParams('tab=other'),
}));

/** The timezone and calendar format reach the hook through the page-chrome adapter, as the app's bridge passes them. */
const ADAPTER: PageChromeAdapter = {
  ...DEFAULT_PAGE_CHROME_ADAPTER,
  timezone: 'UTC',
  formatCalendarDate: (day) => day ?? '',
};
function wrapper({ children }: { children: ReactNode }) {
  return <PageChromeProvider value={ADAPTER}>{children}</PageChromeProvider>;
}

const CONFIG: ListParamsConfig<'ALL' | 'FAILED', 'newest', 'surface'> = {
  statuses: ['FAILED', 'ALL'],
  defaultStatus: 'ALL',
  sorts: ['newest'],
  defaultSort: 'newest',
  filters: { surface: ['CHAT', 'DESK_STEP'] },
  defaultDateWindow: () => '30d',
};

describe('useLocalListParams (a list inside a sheet)', () => {
  it('starts at the defaults and never touches the page URL', () => {
    const { result } = renderHook(() => useLocalListParams(CONFIG), { wrapper });
    expect(result.current.status).toBe('ALL');
    expect(result.current.isFiltered).toBe(false);
    expect(result.current.dateRange.label).toBe('last 30 days');
    act(() => result.current.setStatus('FAILED'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('holds status, search, filters and dates, composes quick successive changes, and clears', () => {
    const { result } = renderHook(() => useLocalListParams(CONFIG), { wrapper });
    act(() => {
      result.current.setStatus('FAILED');
      result.current.setQ('sonnet');
    });
    expect(result.current.status).toBe('FAILED');
    expect(result.current.q).toBe('sonnet');

    act(() => result.current.setFilter('surface', 'CHAT'));
    act(() => result.current.setDateRange(undefined, undefined));
    expect(result.current.filters.surface).toBe('CHAT');
    expect(result.current.dateRange.label).toBeUndefined();
    expect(result.current.isFiltered).toBe(true);

    act(() => result.current.clear());
    expect(result.current.q).toBe('');
    expect(result.current.filters.surface).toBeUndefined();
    expect(result.current.status).toBe('FAILED'); // Clear keeps the pivot
    expect(result.current.isFiltered).toBe(false);
  });

  it('ignores a filter value the config does not allow', () => {
    const { result } = renderHook(() => useLocalListParams(CONFIG), { wrapper });
    act(() => result.current.setFilter('surface', 'FAX'));
    expect(result.current.filters.surface).toBeUndefined();
  });
});
