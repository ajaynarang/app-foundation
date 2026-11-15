/* global describe, it, expect, jest, afterEach */
import {
  addCalendarDays,
  calendarDateToday,
  calendarDateToInstant,
} from '@appshore/web-core/shared/lib/utils/date-utils';
import { HISTORY_PRESETS } from '@app/ui/lib/date-range-presets';
import {
  ALL_TIME,
  ANY_FILTER_VALUE,
  LIST_DATE_PRESETS,
  applyListPatch,
  clearListPatch,
  describeListDateRange,
  isListFiltered,
  listPatchBase,
  parseListParams,
  resolveListDateRange,
  toggleNamedSort,
  type ListParamsConfig,
} from '@appshore/web-core/shared/list/list-params';

type Status = 'RECEIVED' | 'ACCEPTED' | 'ALL';
type Sort = 'newest' | 'oldest';

const config: ListParamsConfig<Status, Sort, 'source'> = {
  statuses: ['RECEIVED', 'ACCEPTED', 'ALL'],
  defaultStatus: 'RECEIVED',
  sorts: ['newest', 'oldest'],
  defaultSort: 'newest',
  filters: { source: ['JIRA', 'MANUAL'] },
};

const parse = (query: string) => parseListParams(new URLSearchParams(query), config);
const patch = (query: string, change: Parameters<typeof applyListPatch<Status, Sort, 'source'>>[1]) =>
  applyListPatch(query, change, config).toString();

describe('parseListParams', () => {
  it('keeps any non-empty value of an open filter (server-defined records), and drops an empty one', () => {
    const open: ListParamsConfig<Status, Sort, 'project' | 'source'> = {
      ...config,
      filters: { project: ANY_FILTER_VALUE, source: ['JIRA', 'MANUAL'] },
    };
    const read = (query: string) => parseListParams(new URLSearchParams(query), open).filters;
    expect(read('project=pr_abc&source=PIGEON')).toEqual({ project: 'pr_abc' });
    expect(read('project=')).toEqual({});
  });

  it('returns the screen defaults for an empty URL', () => {
    expect(parse('')).toEqual({ status: 'RECEIVED', q: '', sort: 'newest', filters: {}, pickedDate: null });
  });

  it('reads every param of a shared link', () => {
    expect(parse('status=ACCEPTED&q=refund&sort=oldest&source=JIRA&from=2026-09-01&to=2026-09-30')).toEqual({
      status: 'ACCEPTED',
      q: 'refund',
      sort: 'oldest',
      filters: { source: 'JIRA' },
      pickedDate: { allTime: false, from: '2026-09-01', to: '2026-09-30' },
    });
  });

  it('falls back to the default for an unknown status, sort or filter value instead of erroring', () => {
    expect(parse('status=BOGUS&sort=createdAt&source=PIGEON')).toEqual({
      status: 'RECEIVED',
      q: '',
      sort: 'newest',
      filters: {},
      pickedDate: null,
    });
  });

  it('reads an explicit "All time" and an open-ended range', () => {
    expect(parse('from=all').pickedDate).toEqual({ allTime: true });
    expect(parse('from=2026-09-01').pickedDate).toEqual({ allTime: false, from: '2026-09-01', to: undefined });
  });

  it('reads a preset stored by name', () => {
    expect(parse('from=7d').pickedDate).toEqual({ allTime: false, preset: '7d' });
    expect(isListFiltered(parse('from=7d'), config)).toBe(true);
  });

  it('ignores dates that are not calendar dates', () => {
    expect(parse('from=yesterday&to=2026-9-1').pickedDate).toBeNull();
  });

  it('ignores a hand-edited day that does not exist, so the default window applies (no overflow to another date)', () => {
    expect(parse('from=2026-99-99').pickedDate).toBeNull();
    expect(parse('from=2026-02-30&to=2026-13-01').pickedDate).toBeNull();
    expect(parse('from=2026-09-01&to=2026-09-31').pickedDate).toEqual({
      allTime: false,
      from: '2026-09-01',
      to: undefined,
    });
  });
});

describe('applyListPatch', () => {
  it('writes non-default values and omits defaults', () => {
    expect(patch('', { status: 'ACCEPTED', sort: 'oldest', q: 'pay' })).toBe('status=ACCEPTED&q=pay&sort=oldest');
    expect(patch('status=ACCEPTED&sort=oldest&q=pay', { status: 'RECEIVED', sort: 'newest', q: '' })).toBe('');
  });

  it('leaves params the list does not own alone', () => {
    expect(patch('tab=inbox', { q: 'x' })).toBe('tab=inbox&q=x');
    expect(patch('tab=inbox&q=x', { q: '' })).toBe('tab=inbox');
  });

  it('sets and removes a filter', () => {
    expect(patch('', { filters: { source: 'JIRA' } })).toBe('source=JIRA');
    expect(patch('source=JIRA', { filters: { source: undefined } })).toBe('');
  });

  it('writes a picked range, an explicit All time, and removes both when reset', () => {
    expect(patch('', { date: { from: '2026-09-01', to: '2026-09-30' } })).toBe('from=2026-09-01&to=2026-09-30');
    expect(patch('from=2026-09-01&to=2026-09-30', { date: ALL_TIME })).toBe('from=all');
    expect(patch('from=2026-09-01&to=2026-09-30', { date: {} })).toBe('from=all');
    expect(patch('from=all', { date: null })).toBe('');
  });

  it('writes a picked preset by NAME, never as today\'s dates — the link is still "last 7 days" tomorrow', () => {
    expect(patch('', { date: { preset: '7d' } })).toBe('from=7d');
    expect(patch('from=2026-09-01&to=2026-09-30', { date: { preset: '30d' } })).toBe('from=30d');
    expect(patch('from=7d', { date: { from: '2026-09-01', to: '2026-09-30' } })).toBe('from=2026-09-01&to=2026-09-30');
    expect(patch('from=7d', { status: 'ACCEPTED' })).toBe('from=7d&status=ACCEPTED');
  });

  it('keeps the picked range when only the pivot changes — it sticks across pivots', () => {
    expect(patch('from=2026-09-01&to=2026-09-30', { status: 'ACCEPTED' })).toBe(
      'from=2026-09-01&to=2026-09-30&status=ACCEPTED',
    );
  });
});

describe('clear', () => {
  it('resets search, filters, date and sort but keeps the pivot and foreign params', () => {
    const query = 'tab=inbox&status=ACCEPTED&q=pay&sort=oldest&source=JIRA&from=all';
    expect(patch(query, clearListPatch(config))).toBe('tab=inbox&status=ACCEPTED');
  });

  it('is offered only when something besides the pivot is non-default', () => {
    expect(isListFiltered(parse(''), config)).toBe(false);
    expect(isListFiltered(parse('status=ACCEPTED'), config)).toBe(false);
    expect(isListFiltered(parse('q=%20'), config)).toBe(false);
    expect(isListFiltered(parse('q=pay'), config)).toBe(true);
    expect(isListFiltered(parse('sort=oldest'), config)).toBe(true);
    expect(isListFiltered(parse('source=JIRA'), config)).toBe(true);
    expect(isListFiltered(parse('from=all'), config)).toBe(true);
  });
});

describe('calendarDateToInstant', () => {
  it('gives the inclusive bounds of a day in the user timezone', () => {
    expect(calendarDateToInstant('2026-10-05', 'America/New_York', 'start')).toBe('2026-10-05T04:00:00.000Z');
    expect(calendarDateToInstant('2026-10-05', 'America/New_York', 'end')).toBe('2026-10-06T03:59:59.999Z');
    expect(calendarDateToInstant('2026-10-05', 'Asia/Kolkata', 'start')).toBe('2026-10-04T18:30:00.000Z');
    expect(calendarDateToInstant('2026-10-05', 'UTC', 'end')).toBe('2026-10-05T23:59:59.999Z');
  });
});

describe('addCalendarDays', () => {
  it('shifts across month, year and leap-day boundaries', () => {
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addCalendarDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(addCalendarDays('2026-01-05', -30)).toBe('2025-12-06');
    expect(addCalendarDays('2026-10-05', 0)).toBe('2026-10-05');
  });
});

describe('resolveListDateRange', () => {
  const today = '2026-10-05';

  it('uses the pivot default until the user picks, then the pick wins', () => {
    expect(resolveListDateRange(null, ALL_TIME, today)).toEqual({});
    expect(resolveListDateRange(null, '30d', today)).toEqual({ from: '2026-09-05', to: '2026-10-05' });
    expect(resolveListDateRange({ allTime: true }, '30d', today)).toEqual({});
    expect(resolveListDateRange({ allTime: false, from: '2026-01-01', to: '2026-01-31' }, '30d', today)).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('resolves a named preset against today each time — it moves with the calendar', () => {
    const picked = { allTime: false, preset: '7d' } as const;
    expect(resolveListDateRange(picked, ALL_TIME, '2026-10-05')).toEqual({ from: '2026-09-28', to: '2026-10-05' });
    expect(resolveListDateRange(picked, ALL_TIME, '2026-10-06')).toEqual({ from: '2026-09-29', to: '2026-10-06' });
  });

  it('knows every preset the date control offers', () => {
    expect(HISTORY_PRESETS.map((preset) => preset.value)).toEqual([...LIST_DATE_PRESETS]);
  });

  it('names a preset window and spells out a custom one', () => {
    const formatDay = (day: string) => day;
    expect(describeListDateRange({}, today, formatDay)).toBeUndefined();
    expect(describeListDateRange({ from: '2026-09-05', to: '2026-10-05' }, today, formatDay)).toBe('last 30 days');
    expect(describeListDateRange({ from: '2026-09-01', to: '2026-09-30' }, today, formatDay)).toBe(
      '2026-09-01 – 2026-09-30',
    );
    expect(describeListDateRange({ from: '2026-09-01' }, today, formatDay)).toBe('from 2026-09-01');
  });
});

// The window's days and its instants must come from ONE timezone. These two zones are 25 hours
// apart, so whatever zone the test process ("the browser") runs in, at least one of them is on a
// different calendar date from it.
describe('date window when the browser and the preference timezone are on different dates', () => {
  const NOW = new Date('2026-10-06T01:00:00.000Z');

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['Pacific/Kiritimati', '2026-10-06'], // UTC+14 — already tomorrow afternoon
    ['Pacific/Pago_Pago', '2026-10-05'], // UTC-11 — still yesterday afternoon
    ['UTC', '2026-10-06'], // the tenant default, seen from a US-evening browser
  ])('%s: the window ends at the end of TODAY there, so a row from a minute ago is inside it', (timezone, day) => {
    jest.useFakeTimers().setSystemTime(NOW);
    const today = calendarDateToday(timezone);
    expect(today).toBe(day);

    const range = resolveListDateRange(null, '30d', today);
    const from = Date.parse(calendarDateToInstant(range.from as string, timezone, 'start'));
    const to = Date.parse(calendarDateToInstant(range.to as string, timezone, 'end'));

    expect(range.to).toBe(day);
    expect(to).toBeGreaterThanOrEqual(NOW.getTime());
    expect(to - NOW.getTime()).toBeLessThan(24 * 60 * 60 * 1000);
    expect(from).toBeLessThan(NOW.getTime() - 29 * 24 * 60 * 60 * 1000);
    expect(describeListDateRange(range, today, (d) => d)).toBe('last 30 days');
  });

  it('shows why the other date is wrong: a day behind the timezone ends the window before now', () => {
    // A US-evening browser says "Oct 5" while the UTC tenant is already on Oct 6.
    const browserDay = resolveListDateRange(null, '30d', '2026-10-05').to as string;
    expect(Date.parse(calendarDateToInstant(browserDay, 'UTC', 'end'))).toBeLessThan(NOW.getTime());
  });
});

describe('listPatchBase — changes made before the URL commits compose', () => {
  it('builds the second change on the first one, not on the still-committed URL', () => {
    const committed = 'tab=inbox';
    const first = applyListPatch(listPatchBase(committed, null), { status: 'ACCEPTED' }, config).toString();
    // The debounced search fires before the router has committed the pivot change.
    const second = applyListPatch(
      listPatchBase(committed, { base: committed, next: first }),
      { q: 'jira' },
      config,
    ).toString();
    expect(second).toBe('tab=inbox&status=ACCEPTED&q=jira');
  });

  it('drops a pending change once the committed URL has moved on (back, a link, the change landing)', () => {
    const pending = { base: 'tab=inbox', next: 'tab=inbox&status=ACCEPTED' };
    expect(listPatchBase('tab=inbox&status=ACCEPTED', pending)).toBe('tab=inbox&status=ACCEPTED');
    expect(listPatchBase('tab=items', pending)).toBe('tab=items');
    expect(listPatchBase('tab=inbox', null)).toBe('tab=inbox');
  });
});

describe('toggleNamedSort', () => {
  const opposites = { newest: 'oldest', oldest: 'newest' } as const;

  it('picking the active sort again selects its pair — the direction flip the arrow promises', () => {
    expect(toggleNamedSort<Sort>('newest', 'newest', opposites)).toBe('oldest');
    expect(toggleNamedSort<Sort>('oldest', 'oldest', opposites)).toBe('newest');
  });

  it('picking another sort selects it, and a sort with no pair stays put', () => {
    expect(toggleNamedSort<Sort>('newest', 'oldest', opposites)).toBe('oldest');
    expect(toggleNamedSort<'newest' | 'priority'>('priority', 'priority', {})).toBe('priority');
  });
});
