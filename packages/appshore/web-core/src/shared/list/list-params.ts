import { isCalendarDateString } from '../lib/utils/date-utils';
import { HISTORY_PRESETS } from '@app/ui/lib/date-range-presets';

/**
 * The URL contract of a product list — pure, so it is unit-tested without a router.
 * `?status=&q=&sort=&from=&to=` plus the screen's own filter params. Defaults are never
 * written; an unknown value in a shared link falls back to the default instead of erroring.
 *
 * `from` holds one of three things: a calendar date (a Custom range, with `to`), a preset
 * name (`?from=7d` — stays "last 7 days" tomorrow), or `all` (an explicit All time).
 */
export const LIST_PARAM = { STATUS: 'status', Q: 'q', SORT: 'sort', FROM: 'from', TO: 'to' } as const;

/** `?from=all` — the user explicitly chose "All time" (distinct from "no choice yet"). */
export const ALL_TIME = 'all';

/** The relative windows a list can be on — the `HISTORY_PRESETS` values. */
export const LIST_DATE_PRESETS = ['today', '7d', '30d', '90d'] as const;
export type ListDatePreset = (typeof LIST_DATE_PRESETS)[number];

/** A default date window: every row, or one of the relative presets. */
export type ListDateWindow = typeof ALL_TIME | ListDatePreset;

export function isListDatePreset(value: string | null | undefined): value is ListDatePreset {
  return LIST_DATE_PRESETS.includes(value as ListDatePreset);
}

/**
 * A filter whose values only the server knows (a project, an owner) — any non-empty value is kept.
 * The screen checks it against the options it loaded before sending it to the API.
 */
export const ANY_FILTER_VALUE = '*';

export interface ListParamsConfig<S extends string, O extends string, F extends string = never> {
  /** Pivot values, in order. */
  statuses: readonly S[];
  defaultStatus: S;
  /** Named sort options — the same names the endpoint whitelists. */
  sorts: readonly O[];
  defaultSort: O;
  /**
   * Per-screen filter params and the values each accepts, e.g. `{ source: ['JIRA', 'MANUAL'] }` —
   * or `ANY_FILTER_VALUE` for a filter over server-defined records (`{ project: ANY_FILTER_VALUE }`).
   */
  filters?: Record<F, readonly string[] | typeof ANY_FILTER_VALUE>;
  /**
   * The date window a pivot opens on until the user picks one: open queues → `'all'`,
   * history → `'30d'`. Omit for lists with no date control.
   */
  defaultDateWindow?: (status: S) => ListDateWindow;
}

/** What the user picked for the date range, straight from the URL. `null` = nothing picked. */
export type PickedDateRange =
  | { allTime: true }
  /** A relative window, resolved to days when read — never frozen into the URL. */
  | { allTime: false; preset: ListDatePreset }
  /** A Custom range of absolute calendar dates. */
  | { allTime: false; preset?: undefined; from?: string; to?: string }
  | null;

export interface ListParamsState<S extends string, O extends string, F extends string = never> {
  status: S;
  q: string;
  sort: O;
  filters: Partial<Record<F, string>>;
  pickedDate: PickedDateRange;
}

export interface ListParamsPatch<S extends string, O extends string, F extends string = never> {
  status?: S;
  q?: string;
  sort?: O;
  filters?: Partial<Record<F, string | undefined>>;
  /**
   * A picked preset (by name), a Custom range, `'all'` for All time, or `null` to fall back to
   * the pivot's default window.
   */
  date?: { preset: ListDatePreset } | { preset?: undefined; from?: string; to?: string } | typeof ALL_TIME | null;
}

interface ReadableParams {
  get(name: string): string | null;
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && allowed.includes(value as T) ? (value as T) : fallback;
}

function readPickedDate(params: ReadableParams): PickedDateRange {
  const from = params.get(LIST_PARAM.FROM);
  const to = params.get(LIST_PARAM.TO);
  if (from === ALL_TIME) return { allTime: true };
  if (isListDatePreset(from)) return { allTime: false, preset: from };
  const picked = {
    from: from && isCalendarDateString(from) ? from : undefined,
    to: to && isCalendarDateString(to) ? to : undefined,
  };
  return picked.from || picked.to ? { allTime: false, ...picked } : null;
}

export function parseListParams<S extends string, O extends string, F extends string = never>(
  params: ReadableParams,
  config: ListParamsConfig<S, O, F>,
): ListParamsState<S, O, F> {
  const filters: Partial<Record<F, string>> = {};
  for (const key of Object.keys(config.filters ?? {}) as F[]) {
    const value = params.get(key);
    const allowed = config.filters?.[key];
    if (value && allowed && (allowed === ANY_FILTER_VALUE || allowed.includes(value))) filters[key] = value;
  }
  return {
    status: oneOf(params.get(LIST_PARAM.STATUS), config.statuses, config.defaultStatus),
    q: params.get(LIST_PARAM.Q) ?? '',
    sort: oneOf(params.get(LIST_PARAM.SORT), config.sorts, config.defaultSort),
    filters,
    pickedDate: readPickedDate(params),
  };
}

function setOrDelete(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/** Apply a change to the current query string. Params this list does not own are left alone. */
export function applyListPatch<S extends string, O extends string, F extends string = never>(
  current: string,
  patch: ListParamsPatch<S, O, F>,
  config: ListParamsConfig<S, O, F>,
): URLSearchParams {
  const params = new URLSearchParams(current);
  if (patch.status !== undefined) {
    setOrDelete(params, LIST_PARAM.STATUS, patch.status === config.defaultStatus ? undefined : patch.status);
  }
  if (patch.q !== undefined) setOrDelete(params, LIST_PARAM.Q, patch.q);
  if (patch.sort !== undefined) {
    setOrDelete(params, LIST_PARAM.SORT, patch.sort === config.defaultSort ? undefined : patch.sort);
  }
  for (const [key, value] of Object.entries(patch.filters ?? {})) {
    setOrDelete(params, key, value as string | undefined);
  }
  if (patch.date !== undefined) {
    const date = patch.date;
    if (date === null) {
      params.delete(LIST_PARAM.FROM);
      params.delete(LIST_PARAM.TO);
    } else if (date !== ALL_TIME && date.preset) {
      params.set(LIST_PARAM.FROM, date.preset);
      params.delete(LIST_PARAM.TO);
    } else {
      const picked = date === ALL_TIME ? {} : date;
      const isAllTime = !picked.from && !picked.to;
      setOrDelete(params, LIST_PARAM.FROM, isAllTime ? ALL_TIME : picked.from);
      setOrDelete(params, LIST_PARAM.TO, isAllTime ? undefined : picked.to);
    }
  }
  return params;
}

/** The patch behind "Clear": search, filters, date and sort back to defaults — the pivot stays. */
export function clearListPatch<S extends string, O extends string, F extends string = never>(
  config: ListParamsConfig<S, O, F>,
): ListParamsPatch<S, O, F> {
  const filters = Object.fromEntries(Object.keys(config.filters ?? {}).map((key) => [key, undefined])) as Partial<
    Record<F, undefined>
  >;
  return { q: '', sort: config.defaultSort, filters, date: null };
}

/** True when something other than the pivot differs from the screen's defaults — shows "Clear". */
export function isListFiltered<S extends string, O extends string, F extends string = never>(
  state: ListParamsState<S, O, F>,
  config: ListParamsConfig<S, O, F>,
): boolean {
  return (
    state.q.trim() !== '' ||
    state.sort !== config.defaultSort ||
    Object.keys(state.filters).length > 0 ||
    state.pickedDate !== null
  );
}

/**
 * True when search or a screen filter narrows the rows — what "No … match" means. The date window and the sort
 * do not count: picking All time widens the list, and an empty All-time list with nothing narrowed is a
 * first run, not a miss. A screen adds its own pivot test (`|| list.status !== ALL`). Pairs with `listEmptyKind`.
 */
export function isListNarrowed<S extends string, O extends string, F extends string = never>(
  state: ListParamsState<S, O, F>,
): boolean {
  return state.q.trim() !== '' || Object.keys(state.filters).length > 0;
}

/**
 * Which empty state an empty list shows:
 *  - `no-match` — something narrows the rows (search, a filter, a non-All pivot): "No … match" + Clear.
 *  - `empty-window` — nothing narrows, but a date window does: "Nothing in this window" + Show all time.
 *  - `first-run` — nothing narrows and the window is All time: the list is truly empty, first-run copy, no action.
 */
export type ListEmptyKind = 'no-match' | 'empty-window' | 'first-run';

export function listEmptyKind({
  isNarrowed,
  windowLabel,
}: {
  isNarrowed: boolean;
  windowLabel?: string;
}): ListEmptyKind {
  if (isNarrowed) return 'no-match';
  return windowLabel ? 'empty-window' : 'first-run';
}

/** A date range as calendar days (`YYYY-MM-DD`); both undefined = All time. */
export interface ListCalendarRange {
  from?: string;
  to?: string;
}

/**
 * The calendar days a list is showing: what the user picked, else the pivot's default window.
 *
 * `today` MUST be today's date in the timezone the days are later turned into instants with
 * (`calendarDateToday(timezone)`), never the browser's local date. With the browser a day
 * behind that timezone, "last 30 days" would otherwise end before now and hide the newest rows.
 */
export function resolveListDateRange(
  picked: PickedDateRange,
  fallback: ListDateWindow,
  today: string,
): ListCalendarRange {
  if (picked?.allTime) return {};
  if (picked && !picked.preset) return { from: picked.from, to: picked.to };
  const window = picked?.preset ?? fallback;
  if (window === ALL_TIME) return {};
  return HISTORY_PRESETS.find((preset) => preset.value === window)?.getRange(today) ?? {};
}

/** The window in words for the footer ("last 30 days"); undefined for All time. */
export function describeListDateRange(
  range: ListCalendarRange,
  today: string,
  formatDay: (day: string) => string,
): string | undefined {
  if (!range.from && !range.to) return undefined;
  const preset = HISTORY_PRESETS.find((option) => {
    const presetRange = option.getRange(today);
    return presetRange.from === range.from && presetRange.to === range.to;
  });
  if (preset) return preset.label.toLowerCase();
  if (range.from && range.to) return `${formatDay(range.from)} – ${formatDay(range.to)}`;
  return range.from ? `from ${formatDay(range.from)}` : `to ${formatDay(range.to as string)}`;
}

/** The last URL change this list asked for, and the committed query string it was built on. */
export interface PendingListUrl {
  base: string;
  next: string;
}

/**
 * The query string the next change must build on. `router.replace` commits later, so a second
 * change issued before the first lands (a debounced search firing right after a pivot click)
 * has to start from the first one's result — not from the still-committed URL, or it
 * overwrites it. Once the committed URL moves on, the pending one no longer applies.
 */
export function listPatchBase(committed: string, pending: PendingListUrl | null): string {
  return pending && pending.base === committed ? pending.next : committed;
}

/**
 * Map `SortButton`'s report onto named sorts. Picking the option that is already active means
 * "flip the direction" there; with named sorts that is the paired name (`newest` ⇄ `oldest`).
 * A sort with no pair stays as it is.
 */
export function toggleNamedSort<O extends string>(current: O, picked: O, opposites: Partial<Record<O, O>>): O {
  return picked === current ? (opposites[picked] ?? picked) : picked;
}
