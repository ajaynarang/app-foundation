'use client';

import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export interface ListFooterProps {
  /** Rows loaded so far. */
  shown: number;
  /** Rows in the current view, from the server. Omit only for a feed whose endpoint has no count — the footer then says "Showing 50". */
  total?: number;
  /** The date window in words ("last 30 days"), when one applies. */
  windowLabel?: string;
  hasMore: boolean;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  /** The last Load more failed (`useCursorList().isLoadMoreError`) — say so; the button retries. */
  loadMoreFailed?: boolean;
  className?: string;
}

/**
 * ListFooter — "Showing 50 of 312 · last 30 days" and the Load more button. The list never
 * stops silently: either every row is shown, or the button is there. A failed Load more keeps
 * the rows and turns the button into "Try again".
 */
export function ListFooter({
  shown,
  total,
  windowLabel,
  hasMore,
  onLoadMore,
  isLoadingMore,
  loadMoreFailed = false,
  className,
}: ListFooterProps) {
  const showFailure = loadMoreFailed && !isLoadingMore;
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 pt-1', className)}>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing {shown}
        {total !== undefined && <> of {total}</>}
        {windowLabel && <> · {windowLabel}</>}
      </p>
      {hasMore && (
        <div className="flex flex-wrap items-center gap-2">
          {showFailure && (
            <p className="text-xs text-destructive" role="alert">
              Couldn&apos;t load more.
            </p>
          )}
          <Button variant="outline" size="sm" onClick={onLoadMore} loading={isLoadingMore}>
            {showFailure ? 'Try again' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
