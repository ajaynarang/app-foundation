'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { useWebhooks, type WebhookSubscription } from '../use-webhooks';
import { subscriptionState, summariseEvents } from '../constants';
import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageLoadingSkeleton,
  PageSection,
  RelativeTime,
  RowActions,
} from '@/shared/components/page-chrome';
import { WebhookDetailSheet } from './WebhookDetailSheet';

export interface WebhooksListProps {
  /** Opens the create sheet, which the page owns beside its header button. */
  onCreate: () => void;
}

export function WebhooksList({ onCreate }: WebhooksListProps) {
  const list = useWebhooks();
  const { isLoading } = list;

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<WebhookSubscription | null>(null);

  const webhooks = list.items;

  const openDetail = (wh: WebhookSubscription) => {
    setSelected(wh);
    setDetailOpen(true);
  };

  return (
    <PageSection title="Endpoints" description="HTTP destinations that receive event deliveries from your tenant.">
      {isLoading ? (
        <PageLoadingSkeleton variant="table" rows={3} />
      ) : list.isError ? (
        <ListErrorState
          title="Couldn't load your webhooks."
          error={list.error}
          onRetry={() => void list.refetch()}
          isRetrying={list.isRefetching}
        />
      ) : webhooks.length === 0 ? (
        <PageEmptyState
          title="No webhooks yet"
          description="Create a webhook to receive real-time event notifications."
          action={<Button onClick={onCreate}>Create webhook</Button>}
        />
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((wh) => {
                const state = subscriptionState(wh.active);
                return (
                  <TableRow key={wh.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(wh)}>
                    <TableCell className="font-mono text-xs text-foreground max-w-[280px] truncate">{wh.url}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {summariseEvents(wh.events)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      <RelativeTime iso={wh.createdAt} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        primary={{
                          label: 'Open',
                          ariaLabel: `Open the webhook for ${wh.url}`,
                          onClick: () => openDetail(wh),
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {webhooks.length > 0 && (
        <ListFooter
          shown={webhooks.length}
          total={list.total}
          hasMore={list.hasMore}
          onLoadMore={list.loadMore}
          isLoadingMore={list.isLoadingMore}
          loadMoreFailed={list.isLoadMoreError}
        />
      )}

      <WebhookDetailSheet
        webhook={selected}
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) setSelected(null);
        }}
      />
    </PageSection>
  );
}
