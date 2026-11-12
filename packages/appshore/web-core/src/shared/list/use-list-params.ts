'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { calendarDateToInstant, DISPLAY_FORMATS } from '../lib/utils/date-utils';
import { usePageChrome } from '@app/ui/components/page-chrome/page-chrome-context';
import {
  ALL_TIME,
  applyListPatch,
  clearListPatch,
  describeListDateRange,
  isListDatePreset,
  isListFiltered,
  isListNarrowed,
  listPatchBase,
  parseListParams,
  resolveListDateRange,
  type ListParamsConfig,
  type ListParamsPatch,
  type PendingListUrl,
} from './list-params';

export interface ListDateRange {
  /** Calendar dates (`YYYY-MM-DD`) for `<DateRangeFilter>`; both undefined = All time. */
  from?: string;
  to?: string;
  /** The same bounds as inclusive instants in the user's timezone — what the API takes. */
  fromInstant?: string;
  toInstant?: string;
  /** The window in words for `<ListFooter>` ("last 30 days"); undefined for All time. */
  label?: string;
}

/**
 * useListParams — a product list's status / search / sort / date / filters, held in the URL
 * so a filtered view can be shared and survives back and refresh. Pass a MODULE-LEVEL config
 * (a new object each render would rebuild every callback).
 */
export function useListParams<S extends string, O extends string, F extends string = never>(
  config: ListParamsConfig<S, O, F>,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const write = useCallback(
    (next: string) => router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false }),
    [router, pathname],
  );
  return useListParamsState(config, searchParams.toString(), write);
}

/**
 * useLocalListParams — the same contract as `useListParams`, held in component state instead of the URL.
 * For a list that lives INSIDE a sheet or dialog (a webhook's delivery log, a tenant's AI invocations):
 * the page under it owns the URL, and two lists never share a page's URL. The state starts at the
 * defaults each time the component mounts — close the sheet and the filters are gone, as a sheet should.
 */
export function useLocalListParams<S extends string, O extends string, F extends string = never>(
  config: ListParamsConfig<S, O, F>,
) {
  const [search, setSearch] = useState('');
  return useListParamsState(config, search, setSearch);
}

function useListParamsState<S extends string, O extends string, F extends string = never>(
  config: ListParamsConfig<S, O, F>,
  search: string,
  write: (next: string) => void,
) {
  // The app's timezone and calendar-date format come through the page-chrome adapter (`PageChromeProvider`).
  const { timezone, formatCalendarDate, calendarDateToday } = usePageChrome();

  const state = useMemo(() => parseListParams(new URLSearchParams(search), config), [search, config]);

  // A URL write commits later: remember what was last asked for, so a second change made
  // before the first lands composes with it instead of overwriting it (see `listPatchBase`).
  const pending = useRef<PendingListUrl | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [search]);

  const update = useCallback(
    (patch: ListParamsPatch<S, O, F>) => {
      const next = applyListPatch(listPatchBase(search, pending.current), patch, config).toString();
      pending.current = { base: search, next };
      write(next);
    },
    [search, config, write],
  );
  // "Today" in the SAME timezone the days become instants in — never the browser's local date.
  const today = calendarDateToday(timezone);
  const dateRange = useMemo<ListDateRange>(() => {
    const range = resolveListDateRange(state.pickedDate, config.defaultDateWindow?.(state.status) ?? ALL_TIME, today);
    return {
      ...range,
      fromInstant: range.from ? calendarDateToInstant(range.from, timezone, 'start') : undefined,
      toInstant: range.to ? calendarDateToInstant(range.to, timezone, 'end') : undefined,
      label: describeListDateRange(range, today, (day) => formatCalendarDate(day, DISPLAY_FORMATS.COMPACT)),
    };
  }, [state.pickedDate, state.status, config, timezone, today, formatCalendarDate]);

  return {
    ...state,
    dateRange,
    /** Something besides the pivot is non-default — show "Clear". */
    isFiltered: isListFiltered(state, config),
    /** Search or a filter narrows the rows (not the date window) — "No … match" vs first-run (`listEmptyKind`). */
    isNarrowed: isListNarrowed(state),
    update,
    setStatus: (status: S) => update({ status }),
    setQ: (q: string) => update({ q }),
    setSort: (sort: O) => update({ sort }),
    setFilter: (key: F, value: string | undefined) =>
      update({ filters: { [key]: value } as Partial<Record<F, string | undefined>> }),
    /** Wire to `<DateRangeFilter onChange>`: a preset is stored by name (`?from=7d`), a Custom range by its dates. */
    setDateRange: (from: string | undefined, to: string | undefined, preset?: string) =>
      update({ date: isListDatePreset(preset) ? { preset } : { from, to } }),
    clear: () => update(clearListPatch(config)),
  };
}
