'use client';

import { ShieldCheck } from 'lucide-react';
import { StatusBadge } from '@app/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageLoadingSkeleton,
  PageSection,
  RelativeTime,
} from '@/shared/components/page-chrome';
import { CHANNEL_LABEL } from '../constants';
import { useOutboundHeldBack } from '../hooks';

/**
 * Sends the gate held back that have no delivery-ledger row: sign-in codes, invitations, password resets, webhooks.
 * Notification sends that were held back are in the delivery ledger (`notification_deliveries`) as SKIPPED with
 * reason GATED instead.
 */
export function HeldBackSection() {
  const heldBack = useOutboundHeldBack();

  return (
    <PageSection
      title="Held back"
      description="Messages this environment would have sent to someone not on the list. Recipients are masked; codes and links are removed. Held-back notifications are in the delivery ledger as SKIPPED, reason GATED. Kept 30 days."
    >
      {heldBack.isLoading ? (
        <PageLoadingSkeleton variant="table" rows={5} />
      ) : heldBack.isError ? (
        <ListErrorState
          title="Couldn't load the held-back messages."
          error={heldBack.error}
          onRetry={() => heldBack.refetch()}
          isRetrying={heldBack.isRefetching}
        />
      ) : heldBack.items.length === 0 ? (
        <PageEmptyState icon={ShieldCheck} title="Nothing held back" description="No message has been stopped yet." />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-border">
            <Table aria-busy={heldBack.isRefreshing} className={heldBack.isRefreshing ? 'opacity-60' : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="hidden md:table-cell">Message</TableHead>
                  <TableHead className="hidden lg:table-cell">Source</TableHead>
                  <TableHead className="hidden lg:table-cell">Tenant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {heldBack.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      <RelativeTime iso={item.createdAt} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone="neutral">{CHANNEL_LABEL[item.channel]}</StatusBadge>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{item.recipient}</TableCell>
                    <TableCell className="hidden max-w-md truncate text-muted-foreground md:table-cell">
                      {item.subject ?? '—'}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                      {item.source}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {item.tenant?.companyName ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ListFooter
            shown={heldBack.items.length}
            total={heldBack.total}
            hasMore={heldBack.hasMore}
            onLoadMore={heldBack.loadMore}
            isLoadingMore={heldBack.isLoadingMore}
            loadMoreFailed={heldBack.isLoadMoreError}
          />
        </div>
      )}
    </PageSection>
  );
}
