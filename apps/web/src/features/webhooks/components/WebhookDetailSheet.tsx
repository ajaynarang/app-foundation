'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormSheet } from '@sally/ui/components/ui/form-sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { MoreHorizontal, Play, Pencil, Trash2, RotateCw, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookLogs,
  useRetryDelivery,
  type WebhookSubscription,
  type WebhookDeliveryLog,
} from '../use-webhooks';
import { EventPicker } from './event-picker';
import { DateRangeFilter, HISTORY_PRESETS } from '@/shared/components/ui/date-range-filter';

interface Props {
  webhook: WebhookSubscription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 20;

function getDeliveryStatus(log: WebhookDeliveryLog): 'Delivered' | 'Failed' | 'Pending' {
  if (log.deliveredAt) return 'Delivered';
  if (log.failedAt) return 'Failed';
  return 'Pending';
}

function StatusBadge({ status }: { status: 'Delivered' | 'Failed' | 'Pending' }) {
  if (status === 'Delivered')
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-600/20 dark:text-emerald-400 dark:border-emerald-600/30">
        Delivered
      </Badge>
    );
  if (status === 'Failed')
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-600/20 dark:text-red-400 dark:border-red-600/30">
        Failed
      </Badge>
    );
  return (
    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-600/20 dark:text-yellow-400 dark:border-yellow-600/30">
      Pending
    </Badge>
  );
}

export function WebhookDetailSheet({ webhook, open, onOpenChange }: Props) {
  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [wildcard, setWildcard] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [tab, setTab] = useState('overview');

  // Logs state
  const [offset, setOffset] = useState(0);
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);

  // Delete confirm
  const [showDelete, setShowDelete] = useState(false);

  const resetEditFromWebhook = () => {
    if (!webhook) return;
    setUrl(webhook.url);
    setDescription(webhook.description ?? '');
    if (webhook.events.includes('*')) {
      setWildcard(true);
      setSelectedEvents([]);
    } else {
      setWildcard(false);
      setSelectedEvents(webhook.events);
    }
  };

  useEffect(() => {
    if (webhook && open) {
      resetEditFromWebhook();
      setOffset(0);
      setTab('overview');
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook?.id, open]);

  const { data, isLoading } = useWebhookLogs(webhook?.id ?? '', {
    limit: PAGE_SIZE,
    offset,
    dateFrom,
    dateTo,
  });
  const retryDelivery = useRetryDelivery();

  const isDirty = useMemo(() => {
    if (!webhook) return false;
    if (url !== webhook.url) return true;
    if ((description || '') !== (webhook.description || '')) return true;
    const a = wildcard ? ['*'] : [...selectedEvents].sort();
    const b = [...webhook.events].sort();
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [webhook, url, description, wildcard, selectedEvents]);

  const isValidUrl = url.trim().startsWith('https://') && url.trim().length > 10;
  const canSave = isDirty && isValidUrl && (wildcard || selectedEvents.length > 0);

  const handleSave = async () => {
    if (!webhook) return;
    try {
      await updateMutation.mutateAsync({
        id: webhook.id,
        data: {
          url,
          events: wildcard ? ['*'] : selectedEvents,
          description: description || undefined,
        },
      });
    } catch {
      // toast handled by hook
    }
  };

  const handleDelete = () => {
    if (!webhook) return;
    deleteMutation.mutate(webhook.id, {
      onSuccess: () => {
        setShowDelete(false);
        onOpenChange(false);
      },
    });
  };

  const total = data?.total ?? 0;
  const logs = data?.logs ?? [];
  const start = total > 0 ? offset + 1 : 0;
  const end = Math.min(offset + PAGE_SIZE, total);

  if (!webhook) return null;

  // View-mode footer: overflow menu on the left, Edit + Delete on the right.
  // Driver/Load-sheet convention — surfaces read mode actions without clutter.
  const viewFooter = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() => testMutation.mutate(webhook.id)}
            disabled={testMutation.isPending || !webhook.active}
          >
            <Play className="h-4 w-4 mr-2" />
            Send test event
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <Button
        size="sm"
        onClick={() => {
          resetEditFromWebhook();
          setIsEditing(true);
          setTab('overview');
        }}
      >
        <Pencil className="h-4 w-4 mr-1" />
        Edit
      </Button>
    </>
  );

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Webhook"
        description={webhook.url}
        mode={isEditing ? 'edit' : 'view'}
        size="md"
        pinnable
        resizable
        onSubmit={handleSave}
        onCancel={() => {
          setIsEditing(false);
          resetEditFromWebhook();
        }}
        submitLabel="Save changes"
        isSubmitting={updateMutation.isPending}
        footerExtra={isEditing ? undefined : viewFooter}
      >
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logs">Delivery Logs</TabsTrigger>
          </TabsList>

          {/* OVERVIEW — read mode shows values, edit mode shows the form */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="wh-url">Endpoint URL</Label>
                  <Input
                    id="wh-url"
                    placeholder="https://your-app.com/webhooks"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="font-mono"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wh-desc">Description (optional)</Label>
                  <Textarea
                    id="wh-desc"
                    placeholder="What this webhook is used for"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <EventPicker
                  wildcard={wildcard}
                  onWildcardChange={setWildcard}
                  selectedEvents={selectedEvents}
                  onSelectedEventsChange={setSelectedEvents}
                />
              </>
            ) : (
              <>
                <Field label="Endpoint URL">
                  <code className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{webhook.url}</code>
                </Field>
                <Field label="Status">
                  <Badge
                    className={
                      webhook.active
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-600/20 dark:text-emerald-400 dark:border-emerald-600/30'
                        : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-600/20 dark:text-gray-400 dark:border-gray-600/30'
                    }
                  >
                    {webhook.active ? 'Active' : 'Inactive'}
                  </Badge>
                </Field>
                <Field label="Events">
                  <div className="flex flex-wrap gap-1">
                    {webhook.events.includes('*') ? (
                      <Badge variant="outline">All events (*)</Badge>
                    ) : (
                      webhook.events.map((e) => (
                        <Badge key={e} variant="outline" className="font-mono text-xs">
                          {e}
                        </Badge>
                      ))
                    )}
                  </div>
                </Field>
                {webhook.description && (
                  <Field label="Description">
                    <p className="text-sm text-foreground">{webhook.description}</p>
                  </Field>
                )}
                <Field label="Created">
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(webhook.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </Field>
                {webhook._count && (
                  <Field label="Total deliveries">
                    <p className="text-sm text-foreground">{webhook._count.deliveryLogs}</p>
                  </Field>
                )}
              </>
            )}
          </TabsContent>

          {/* DELIVERY LOGS */}
          <TabsContent value="logs" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {total > 0 ? `${start}–${end} of ${total}` : 'No deliveries'}
              </p>
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                defaultPreset="today"
                presets={HISTORY_PRESETS}
                onChange={(from, to) => {
                  setDateFrom(from);
                  setDateTo(to);
                  setOffset(0);
                }}
              />
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {dateFrom || dateTo
                    ? 'No deliveries in this date range. Try widening the window.'
                    : 'Delivery attempts will appear here once events are triggered.'}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Code</TableHead>
                        <TableHead className="hidden sm:table-cell">Attempts</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="w-[60px]" />
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
                              {log.responseStatus ?? '—'}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">{log.attempts}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(log.createdAt), {
                                addSuffix: true,
                              })}
                            </TableCell>
                            <TableCell>
                              {status === 'Failed' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  loading={retryDelivery.isPending && retryDelivery.variables?.logId === log.id}
                                  onClick={() =>
                                    retryDelivery.mutate({
                                      subscriptionId: webhook.id,
                                      logId: log.id,
                                    })
                                  }
                                >
                                  <RotateCw className="h-3.5 w-3.5" />
                                  <span className="sr-only">Retry</span>
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset((p) => Math.max(0, p - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset((p) => p + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </FormSheet>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently deactivate and remove this webhook subscription. No further events will be delivered
              to the endpoint. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
