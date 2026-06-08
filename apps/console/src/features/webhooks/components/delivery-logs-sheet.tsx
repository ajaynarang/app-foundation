'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@app/ui/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useWebhookLogs, type WebhookSubscription, type WebhookDeliveryLog } from '../use-webhooks';

const PAGE_SIZE = 20;

interface Props {
  webhook: WebhookSubscription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getDeliveryStatus(log: WebhookDeliveryLog): 'Delivered' | 'Failed' | 'Pending' {
  if (log.deliveredAt) return 'Delivered';
  if (log.failedAt) return 'Failed';
  return 'Pending';
}

function StatusBadge({ status }: { status: 'Delivered' | 'Failed' | 'Pending' }) {
  switch (status) {
    case 'Delivered':
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-600/20 dark:text-green-400 dark:border-green-600/30 hover:bg-green-100 dark:hover:bg-green-600/20">
          Delivered
        </Badge>
      );
    case 'Failed':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-600/20 dark:text-red-400 dark:border-red-600/30 hover:bg-red-100 dark:hover:bg-red-600/20">
          Failed
        </Badge>
      );
    case 'Pending':
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-600/20 dark:text-yellow-400 dark:border-yellow-600/30 hover:bg-yellow-100 dark:hover:bg-yellow-600/20">
          Pending
        </Badge>
      );
  }
}

export function DeliveryLogsSheet({ webhook, open, onOpenChange }: Props) {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useWebhookLogs(webhook?.id ?? '', PAGE_SIZE, offset);

  function handleClose(isOpen: boolean) {
    if (!isOpen) setOffset(0);
    onOpenChange(isOpen);
  }

  const total = data?.total ?? 0;
  const logs = data?.logs ?? [];
  const start = total > 0 ? offset + 1 : 0;
  const end = Math.min(offset + PAGE_SIZE, total);

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" pinnable resizable>
        <SheetHeader>
          <SheetTitle>Delivery Logs</SheetTitle>
          <SheetDescription>
            {webhook?.url && <code className="font-mono text-xs">{webhook.url}</code>}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No deliveries yet</h3>
              <p className="text-sm text-muted-foreground">
                Delivery attempts will appear here once events are triggered.
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Code</TableHead>
                    <TableHead className="hidden sm:table-cell">Attempts</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const status = getDeliveryStatus(log);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs">{log.event}</TableCell>
                        <TableCell>
                          <StatusBadge status={status} />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell font-mono text-xs">
                          {log.responseStatus ?? '---'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{log.attempts}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(log.createdAt), {
                            addSuffix: true,
                          })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {start}-{end} of {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
