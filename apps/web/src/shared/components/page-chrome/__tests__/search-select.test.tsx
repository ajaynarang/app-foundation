/**
 * @jest-environment jsdom
 */
/* global describe, it, expect, jest, beforeAll, beforeEach */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SearchSelect, type SearchSelectOption } from '../search-select';

interface Pack {
  publicId: string;
  name: string;
}
const pack = (name: string): Pack => ({ publicId: `sp_${name.toLowerCase()}`, name });
const toOption = (row: Pack): SearchSelectOption => ({ key: row.publicId, label: row.name });

/** What the (mocked) server search currently answers — the test swaps it and re-renders. */
const mockSearch = {
  items: [] as Pack[],
  total: 0,
  q: '',
  isSearching: false,
  isLoading: false,
  isStale: false,
  isError: false,
  error: null as unknown,
  refetch: jest.fn(),
};
const mockEnabled: boolean[] = [];

// The real highlight logic against the real cmdk — only the data is faked.
jest.mock('@appshore/web-core/shared/list/use-picker-search', () => ({
  usePickerSearch: (_term: string, _source: unknown, options: { enabled?: boolean }) => {
    mockEnabled.push(options.enabled ?? true);
    return mockSearch;
  },
}));

const SOURCE = { queryKey: () => ['packs'], queryFn: jest.fn() };

function answer(items: Pack[], q: string, total = items.length) {
  Object.assign(mockSearch, {
    items,
    total,
    q,
    isSearching: q.length > 0,
    isStale: false,
    isLoading: false,
    isError: false,
    error: null,
  });
}

function highlightedKey(): string | null {
  const selected = document.querySelectorAll('[cmdk-item][data-selected="true"]');
  expect(selected.length).toBeLessThanOrEqual(1);
  return selected[0]?.getAttribute('data-value') ?? null;
}

function setup(value: SearchSelectOption | null = null) {
  const onChange = jest.fn();
  const element = () => (
    <SearchSelect
      value={value}
      onChange={onChange}
      source={SOURCE}
      toOption={toOption}
      placeholder="Pick a pack"
      searchPlaceholder="Search packs…"
      noun="packs"
    />
  );
  const view = render(element());
  const open = () => fireEvent.click(screen.getByRole('combobox'));
  const input = () => screen.getByPlaceholderText('Search packs…');
  const type = (text: string) => fireEvent.change(input(), { target: { value: text } });
  /** The server answered: new rows reach the select. */
  const receive = (items: Pack[], q: string, total?: number) => {
    act(() => answer(items, q, total));
    view.rerender(element());
  };
  const pressEnter = () => fireEvent.keyDown(input(), { key: 'Enter' });
  return { onChange, open, type, receive, pressEnter, view, element };
}

const FIRST_PAGE = [pack('Alpha'), pack('Baseline'), pack('Payments')];

describe('SearchSelect — a form select over a server-searched list', () => {
  beforeAll(() => {
    // jsdom lacks the layout APIs cmdk and the popover call.
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    answer(FIRST_PAGE, '');
    mockEnabled.length = 0;
  });

  it('shows the placeholder, and fetches nothing until it is opened', () => {
    const { open } = setup();
    expect(screen.getByRole('combobox').textContent).toBe('Pick a pack');
    expect(mockEnabled.at(-1)).toBe(false);
    open();
    expect(mockEnabled.at(-1)).toBe(true);
  });

  it('names the chosen option on the trigger, even when no page holds it', () => {
    setup({ key: 'sp_zeta', label: 'Zeta', code: 'C-9' });
    expect(screen.getByRole('combobox').textContent).toBe('C-9 — Zeta');
  });

  it('opens on the first row, or on the chosen one when it is listed', () => {
    const first = setup();
    first.open();
    expect(highlightedKey()).toBe('sp_alpha');
    first.view.unmount();

    const chosen = setup({ key: 'sp_payments', label: 'Payments' });
    chosen.open();
    expect(highlightedKey()).toBe('sp_payments');
  });

  it('↵ picks the first row of the new results, not the row highlighted before the search', () => {
    const { onChange, open, type, receive, pressEnter } = setup();
    open();
    type('pay');
    receive([pack('Payments'), pack('Repayments')], 'pay');

    expect(highlightedKey()).toBe('sp_payments');
    pressEnter();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ key: 'sp_payments', label: 'Payments' });
  });

  it('ignores ↵ while the rows on screen still answer an earlier term', () => {
    const { onChange, open, type, pressEnter, view, element } = setup();
    open();
    type('pay');
    act(() => {
      mockSearch.isStale = true;
    });
    view.rerender(element());

    pressEnter();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says how many more exist than it shows, and how to reach them', () => {
    const { open, type, receive } = setup();
    open();
    receive(FIRST_PAGE, '', 120);
    expect(screen.getByText('Showing the first 3 of 120 — search to reach the rest.')).toBeTruthy();

    type('a');
    receive(FIRST_PAGE, 'a', 80);
    expect(screen.getByText('Showing 3 of 80 matches — keep typing to narrow it down.')).toBeTruthy();
  });

  it('shows a failure as a failure with Retry — never as "no packs match"', () => {
    const { open, view, element } = setup();
    act(() => {
      Object.assign(mockSearch, { items: [], total: 0, isError: true, error: new Error('boom') });
    });
    view.rerender(element());
    open();

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load packs.");
    expect(screen.queryByText('No packs yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockSearch.refetch).toHaveBeenCalled();
  });

  it('tells "nothing matches" from "nothing yet"', () => {
    const { open, type, receive } = setup();
    open();
    receive([], '');
    expect(screen.getByText('No packs yet.')).toBeTruthy();
    type('zzz');
    receive([], 'zzz');
    expect(screen.getByText('No packs match.')).toBeTruthy();
  });
});
