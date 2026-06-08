/**
 * Page Chrome — the canonical dispatcher page layout system.
 *
 * Four zones: Identity (PageHeader) · Toolbar (PageToolbar + PageTabs) ·
 * Filter bar (FilterBar) · Data (page-owned). Composition wrappers over the local
 * @/shared/components/ui primitives — no new design primitives.
 *
 * See sally-frontend-patterns §15.4 (Page Chrome) for the full pattern and rules.
 */
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

// Re-export TabsContent so pages get tab panels from one import alongside PageTabs.
export { TabsContent } from '@/shared/components/ui/tabs';
