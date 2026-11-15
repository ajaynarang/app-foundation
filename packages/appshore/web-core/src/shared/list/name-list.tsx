'use client';

import { SortButton, type SortOption } from '@app/ui/components/ui/sort-button';
import { ListFilterRow } from '@app/ui/components/page-chrome/list-filter-row';
import { ListSearch } from '@app/ui/components/page-chrome/list-search';
import { toggleNamedSort, type ListParamsConfig } from './list-params';
import type { useListParams } from './use-list-params';

/**
 * The simplest product list: no status, no date — a search on the name and a sort by `name`
 * (A → Z, the default) or `newest`. Packs, skills, source documents and repos are this list.
 */
export const NAME_LIST_SORTS = ['name', 'newest'] as const;
export type NameListSort = (typeof NAME_LIST_SORTS)[number];

/** A list with no status declares the one view it has. */
const WHOLE_LIST = 'all' as const;

/** Pass this module-level constant to `useListParams`. */
export const NAME_LIST_CONFIG: ListParamsConfig<typeof WHOLE_LIST, NameListSort> = {
  statuses: [WHOLE_LIST],
  defaultStatus: WHOLE_LIST,
  sorts: NAME_LIST_SORTS,
  defaultSort: 'name',
};

const SORT_OPTIONS: (SortOption & { value: NameListSort; defaultOrder: 'asc' | 'desc' })[] = [
  { value: 'name', label: 'Name', defaultOrder: 'asc' },
  { value: 'newest', label: 'Newest', defaultOrder: 'desc' },
];
const SORT_ORDER: Record<NameListSort, 'asc' | 'desc'> = { name: 'asc', newest: 'desc' };
/** Neither sort has a reverse on these lists — picking the active one again leaves it as it is. */
const SORT_OPPOSITE: Partial<Record<NameListSort, NameListSort>> = {};

export interface NameListFilterRowProps {
  list: ReturnType<typeof useListParams<typeof WHOLE_LIST, NameListSort>>;
  /** "Search packs…" */
  searchPlaceholder: string;
}

/** The filter row of a name list: search → sort → Clear, right-aligned (there is no pivot). */
export function NameListFilterRow({ list, searchPlaceholder }: NameListFilterRowProps) {
  return (
    <ListFilterRow
      search={<ListSearch value={list.q} onChange={list.setQ} placeholder={searchPlaceholder} />}
      canClear={list.isFiltered}
      onClear={list.clear}
    >
      <SortButton
        options={SORT_OPTIONS}
        sortBy={list.sort}
        sortOrder={SORT_ORDER[list.sort]}
        onSortChange={(value) => list.setSort(toggleNamedSort(list.sort, value as NameListSort, SORT_OPPOSITE))}
      />
    </ListFilterRow>
  );
}
