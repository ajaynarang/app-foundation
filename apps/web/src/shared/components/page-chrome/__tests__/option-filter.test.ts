/* global describe, it, expect */
import { resolveOptionFilter } from '@appshore/web-core/shared/list/option-filter';

describe('resolveOptionFilter', () => {
  it('sends a linked value that is among the loaded options', () => {
    expect(resolveOptionFilter('production', ['staging', 'production'], false)).toEqual({
      status: 'ready',
      value: 'production',
      holdList: false,
    });
  });

  it('falls back to "All" only once the options loaded and the value is not among them', () => {
    expect(resolveOptionFilter('gone', ['staging'], false)).toEqual({
      status: 'ready',
      value: undefined,
      holdList: false,
    });
  });

  it('holds the list while a linked value cannot be checked yet', () => {
    expect(resolveOptionFilter('production', undefined, false)).toEqual({
      status: 'loading',
      value: undefined,
      holdList: true,
    });
  });

  it('is loading, but does not hold the list, when nothing is linked', () => {
    expect(resolveOptionFilter(undefined, undefined, false)).toEqual({
      status: 'loading',
      value: undefined,
      holdList: false,
    });
  });

  it('is an error — never "All" — when the options could not be loaded', () => {
    expect(resolveOptionFilter('production', undefined, true)).toEqual({
      status: 'error',
      value: undefined,
      holdList: true,
    });
    expect(resolveOptionFilter(undefined, undefined, true).status).toBe('error');
  });

  it('keeps using options already on hand when a background refetch of them fails', () => {
    expect(resolveOptionFilter('production', ['production'], true)).toEqual({
      status: 'ready',
      value: 'production',
      holdList: false,
    });
  });

  it('reads an empty answer as ready — the server says there are no options', () => {
    expect(resolveOptionFilter(undefined, [], false).status).toBe('ready');
  });
});
