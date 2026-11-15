/**
 * A filter over values only the server knows (a project, an environment, an event type) is
 * checked against the options the screen loaded. Those options are therefore part of the
 * list's own state: until they arrive the list is loading, and if they cannot be loaded the
 * list is in error — a failed options fetch must never read as "All" or as "nothing here".
 */
export type OptionFilterStatus = 'loading' | 'error' | 'ready';

export interface OptionFilter {
  status: OptionFilterStatus;
  /** The linked value, once it is known to be among the options; otherwise undefined ("All"). */
  value: string | undefined;
  /** A value is linked but cannot be checked yet — keep the list query off (`enabled: !holdList`). */
  holdList: boolean;
}

/**
 * @param linked  the value from the URL (`list.filters.project`)
 * @param known   the option values the server answered with; undefined while there is no answer
 * @param isError the options query failed
 */
export function resolveOptionFilter(
  linked: string | undefined,
  known: readonly string[] | undefined,
  isError: boolean,
): OptionFilter {
  // Options already on hand stay usable even if a background refetch of them failed.
  if (known) return { status: 'ready', value: linked && known.includes(linked) ? linked : undefined, holdList: false };
  return { status: isError ? 'error' : 'loading', value: undefined, holdList: !!linked };
}
