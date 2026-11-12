'use client';

import { useCallback, useState } from 'react';

interface HighlightMark<T> {
  key: string;
  /** The result set the key was highlighted in; `null` = whichever results show next. */
  results: readonly T[] | null;
}

/**
 * The highlighted row of a server-searched cmdk list (`<Command shouldFilter={false}>`).
 *
 * Left to itself cmdk keeps the highlight of the PREVIOUS result set: the row stays highlighted
 * wherever it lands in the new results, or nothing is highlighted when it is gone — so ↵ picks a
 * row the user never chose, or does nothing. Here a highlight only counts for the result set it
 * was made in: every new set of rows starts on its first row, which is the best match.
 *
 * `initialKey` is the row to start on when it is listed (the current item); otherwise the first row.
 *
 * Wire it as `<Command value={highlight.key} onValueChange={highlight.set}>`. `items` must keep
 * its identity while the rows are unchanged (a memoised array, as `usePickerSearch` returns).
 */
export function useResultHighlight<T extends { key: string }>(items: readonly T[], initialKey = '') {
  const [mark, setMark] = useState<HighlightMark<T>>({ key: initialKey, results: null });

  const isCurrent = mark.results === null || mark.results === items;
  const wanted = isCurrent ? mark.key.toLowerCase() : '';
  const item = (wanted && items.find((row) => row.key.toLowerCase() === wanted)) || items[0] || null;

  /** The user (or cmdk) moved the highlight within the rows on screen. */
  const set = useCallback((key: string) => setMark({ key, results: items }), [items]);
  /** Start over — on open (optionally on a preferred row) and whenever the search term changes. */
  const reset = useCallback((key = '') => setMark({ key, results: null }), []);

  return { item, key: item?.key ?? '', set, reset };
}
