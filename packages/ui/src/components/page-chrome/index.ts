/**
 * Page Chrome — the canonical data-page layout system, used by apps/web.
 *
 * Four zones: Identity (PageHeader) · Toolbar (PageToolbar + PageTabs) · Filter row (ListFilterRow) · Data
 * (page-owned). Composition wrappers over the @app/ui primitives — no new design primitives.
 *
 * The LIST KIT below (ListFilterRow, ListSearch, FilterSelect, FilterButton, FilterChips, ListFooter, ListErrorState,
 * ListRows / ListRow, ListCardGrid / ListCard) is how every list fills Zones 3 and 4 (table, cards or rows);
 * the list STATE (useListParams, useCursorList, usePickerSearch, NameListFilterRow) lives in
 * `@appshore/web-core/shared/list`. RowActions / Identifier / RelativeTime are the UI grammar.
 *
 * `@app/ui` imports no app code, no web-core and no router: what the chrome needs from the app (timezone,
 * formatters, the error line, the link component) comes through `PageChromeProvider`.
 */
export {
  PageChromeProvider,
  usePageChrome,
  DEFAULT_PAGE_CHROME_ADAPTER,
  type PageChromeAdapter,
  type PageChromeLink,
  type PageChromeLinkProps,
  type PageChromeProviderProps,
} from './page-chrome-context';
export { PageShell, type PageShellProps } from './page-shell';
export { PageHeader, type PageHeaderProps } from './page-header';
export { PageTabs, PageTabsList, PageTabsTrigger, type PageTabsTriggerProps } from './page-tabs';
export { PageToolbar, type PageToolbarProps } from './page-toolbar';
export { PageActionsMenu, type ActionItem, type PageActionsMenuProps } from './page-actions-menu';
export {
  ViewSwitcher,
  GroupSwitcher,
  type SwitcherOption,
  type ViewSwitcherProps,
  type GroupSwitcherProps,
} from './view-switcher';
export { FilterBar, type FilterBarProps } from './filter-bar';
export { StatusPivot, type StatusPivotSegment, type StatusPivotProps } from './status-pivot';
export { SegmentedControl, type SegmentedOption, type SegmentedControlProps } from './segmented-control';
export { PageEmptyState, type PageEmptyStateProps } from './page-empty-state';
export { PageLoadingSkeleton, type PageLoadingSkeletonProps } from './page-loading-skeleton';
export { PageSection, type PageSectionProps } from './page-section';

// List kit
export { ListFilterRow, type ListFilterRowProps } from './list-filter-row';
export { ListSearch, LIST_SEARCH_DEBOUNCE_MS, type ListSearchProps } from './list-search';
export { FilterSelect, type FilterSelectOption, type FilterSelectProps } from './filter-select';
export { FilterButton, type FilterButtonProps } from './filter-button';
export { FilterChips, type FilterChipsProps } from './filter-chips';
export {
  appliedFilters,
  describeFilter,
  filterRowMode,
  type FilterRowMode,
  type ListFilterDeclaration,
} from './list-filters';
export { ListFooter, type ListFooterProps } from './list-footer';
export { ListRows, ListRow, type ListRowsProps, type ListRowProps, type ListRowSelection } from './list-row';
export { ListCardGrid, ListCard, type ListCardGridProps, type ListCardProps } from './list-card';
export { ListErrorState, type ListErrorStateProps } from './list-error-state';

// TabsContent from the same place as PageTabs, so pages get tab panels from one import.
export { TabsContent } from '../ui/tabs';

// UI grammar: one action grammar, identifiers, relative time
export {
  RowActions,
  renderRowActions,
  type RowActionItem,
  type RowActionPrimary,
  type RowActionsProps,
  type RowActionsSlot,
} from './row-actions';
export { Identifier, IDENTIFIER_CLASS, type IdentifierProps } from './identifier';
export { RelativeTime, relativeStamp, type RelativeTimeProps } from './relative-time';

// The filter-row controls that are ui primitives in their own right.
export { SortButton, type SortOption } from '../ui/sort-button';
export { DateRangeFilter, HISTORY_PRESETS, PERIOD_PRESETS, type DateRangePresetOption } from '../ui/date-range-filter';
