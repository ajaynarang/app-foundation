/* global describe, it, expect, jest */
import {
  isListFiltered,
  isListNarrowed,
  listEmptyKind,
  parseListParams,
  type ListParamsConfig,
} from '@appshore/web-core/shared/list/list-params';
import { combineReads } from '@appshore/web-core/shared/list/combine-reads';

const config: ListParamsConfig<'ALL' | 'FAILED', 'newest', 'source'> = {
  statuses: ['FAILED', 'ALL'],
  defaultStatus: 'ALL',
  sorts: ['newest'],
  defaultSort: 'newest',
  filters: { source: ['JIRA'] },
  defaultDateWindow: () => '30d',
};
const parse = (query: string) => parseListParams(new URLSearchParams(query), config);

describe('isListNarrowed', () => {
  it('counts search and filters, not the date window — an explicit All time widens', () => {
    expect(isListNarrowed(parse(''))).toBe(false);
    expect(isListNarrowed(parse('from=all'))).toBe(false);
    expect(isListNarrowed(parse('from=7d'))).toBe(false);
    expect(isListNarrowed(parse('q=deploy'))).toBe(true);
    expect(isListNarrowed(parse('q=%20%20'))).toBe(false);
    expect(isListNarrowed(parse('source=JIRA'))).toBe(true);
    // isFiltered still lights Clear for an All-time pick — the two answer different questions.
    expect(isListFiltered(parse('from=all'), config)).toBe(true);
  });
});

describe('listEmptyKind', () => {
  it('a miss, an empty window, or a first run', () => {
    expect(listEmptyKind({ isNarrowed: true, windowLabel: 'last 30 days' })).toBe('no-match');
    expect(listEmptyKind({ isNarrowed: true })).toBe('no-match');
    expect(listEmptyKind({ isNarrowed: false, windowLabel: 'last 30 days' })).toBe('empty-window');
    expect(listEmptyKind({ isNarrowed: false })).toBe('first-run');
  });
});

describe('combineReads', () => {
  const ok = () => ({ isLoading: false, isError: false, refetch: jest.fn() });

  it('loading while any read loads', () => {
    expect(combineReads([ok(), { ...ok(), isLoading: true }]).isLoading).toBe(true);
    expect(combineReads([ok(), ok()]).isLoading).toBe(false);
  });

  it('fails when any read fails, carries the first error, and retries only the failed reads', () => {
    const good = ok();
    const badA = { ...ok(), isError: true, error: new Error('403'), isRefetching: true };
    const badB = { ...ok(), isError: true, error: new Error('500') };
    const reads = combineReads([good, badA, badB]);
    expect(reads.isError).toBe(true);
    expect(reads.error).toBe(badA.error);
    expect(reads.isRetrying).toBe(true);
    reads.retry();
    expect(good.refetch).not.toHaveBeenCalled();
    expect(badA.refetch).toHaveBeenCalledTimes(1);
    expect(badB.refetch).toHaveBeenCalledTimes(1);
  });

  it('no failure, no error', () => {
    const reads = combineReads([ok()]);
    expect(reads.isError).toBe(false);
    expect(reads.error).toBeUndefined();
    expect(reads.isRetrying).toBe(false);
  });
});
