'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { useWebhooks, type WebhookSubscription } from '../use-webhooks';
import { CreateWebhookSheet } from './create-webhook-sheet';
import { WebhookDetailSheet } from './WebhookDetailSheet';

function summariseEvents(events: readonly string[]): string {
  if (events.includes('*')) return 'All events (*)';
  if (events.length === 0) return 'None';
  if (events.length <= 2) return events.join(', ');
  return `${events.slice(0, 2).join(', ')} +${events.length - 2} more`;
}

export function WebhooksList() {
  const { data, isLoading } = useWebhooks();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<WebhookSubscription | null>(null);

  const webhooks = data?.subscriptions ?? [];

  const openDetail = (wh: WebhookSubscription) => {
    setSelected(wh);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Endpoints</h2>
          <p className="text-sm text-muted-foreground">
            HTTP destinations that receive event deliveries from your tenant.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Create webhook</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No webhooks yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a webhook to receive real-time event notifications.
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            Create webhook
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((wh) => (
                <TableRow key={wh.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(wh)}>
                  <TableCell className="font-mono text-xs text-foreground max-w-[280px] truncate">{wh.url}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {summariseEvents(wh.events)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={wh.active ? 'info' : 'muted'}>{wh.active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(wh.createdAt), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(wh);
                      }}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateWebhookSheet open={createOpen} onOpenChange={setCreateOpen} />

      <WebhookDetailSheet
        webhook={selected}
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) setSelected(null);
        }}
      />
    </div>
  );
}
