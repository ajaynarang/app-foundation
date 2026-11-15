import type { FilterSelectOption } from './filter-select';

/**
 * One dropdown filter of a product list, declared ONCE by the screen. `ListFilterRow` decides from
 * the count whether it renders inline (one) or behind the Filter button with chips (two or more);
 * the button's badge and the chips read the same declarations, so the applied state has one home —
 * `useListParams().filters`.
 */
export interface ListFilterDeclaration<T extends string = string> {
  /** The URL param this filter owns (`list.setFilter(key, …)`). */
  key: string;
  /** What it filters by — "Project". Names the control, the popover row and the chip. */
  label: string;
  /** The first option, meaning "no filter" — "All projects". */
  allLabel: string;
  options: readonly FilterSelectOption<T>[];
  /** The applied value from `list.filters`; `undefined` = no filter. */
  value: T | undefined;
  /** Wire to `(value) => list.setFilter(key, value)`. */
  onChange: (value: T | undefined) => void;
}

export type FilterRowMode = 'none' | 'inline' | 'button';

/** Exactly one dropdown stays inline; two or more move behind one Filter button. */
export function filterRowMode(filters: readonly ListFilterDeclaration[] | undefined): FilterRowMode {
  const count = filters?.length ?? 0;
  if (count === 0) return 'none';
  return count === 1 ? 'inline' : 'button';
}

/** The filters that hold a value — what the badge counts and the chips show. */
export function appliedFilters(filters: readonly ListFilterDeclaration[]): ListFilterDeclaration[] {
  return filters.filter((filter) => filter.value !== undefined);
}

/** The chip text: the filter's label and the label of the option its value stands for. */
export function describeFilter(filter: ListFilterDeclaration): { label: string; valueLabel: string } {
  const option = filter.options.find((candidate) => candidate.value === filter.value);
  return { label: filter.label, valueLabel: option?.label ?? String(filter.value) };
}
