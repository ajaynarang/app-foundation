'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Webhook, Plus, ScrollText, Play, Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useWebhooks, useDeleteWebhook, useTestWebhook, type WebhookSubscription } from '../use-webhooks';
import { CreateWebhookSheet } from './create-webhook-sheet';
import { EditWebhookSheet } from './edit-webhook-sheet';
import { DeliveryLogsSheet } from './delivery-logs-sheet';

export function WebhooksList() {
  const { data, isLoading } = useWebhooks();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();

  const [createOpen, setCreateOpen] = useState(false);
  const [editWebhook, setEditWebhook] = useState<WebhookSubscription | null>(null);
  const [logsWebhook, setLogsWebhook] = useState<WebhookSubscription | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const webhooks = data?.subscriptions ?? [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-10 w-40" />
        </div>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-5 w-64 mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Webhook
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Webhook className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No webhooks yet</h3>
            <p className="mb-4 text-muted-foreground">
              Create a webhook to receive real-time HTTP callbacks when events occur in your account.
            </p>
            <Button onClick={() => setCreateOpen(true)}>Create First Webhook</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => (
            <Card key={wh.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm truncate">{wh.url}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          wh.active
                            ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-600/20 dark:text-green-400 dark:border-green-600/30 hover:bg-green-100 dark:hover:bg-green-600/20'
                            : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-600/20 dark:text-gray-400 dark:border-gray-600/30 hover:bg-gray-100 dark:hover:bg-gray-600/20'
                        }
                      >
                        {wh.active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {wh.events.includes('*')
                          ? 'All events'
                          : `${wh.events.length} event${wh.events.length !== 1 ? 's' : ''}`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Created{' '}
                        {formatDistanceToNow(new Date(wh.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {wh._count && (
                        <span className="text-xs text-muted-foreground">{wh._count.deliveryLogs} deliveries</span>
                      )}
                    </div>

                    {wh.description && <p className="mt-2 text-sm text-muted-foreground">{wh.description}</p>}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setLogsWebhook(wh)}>
                      <ScrollText className="mr-1 h-4 w-4" />
                      Logs
                    </Button>
                    {wh.active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTestingId(wh.id);
                          testMutation.mutate(wh.id, {
                            onSettled: () => setTestingId(null),
                          });
                        }}
                        loading={testMutation.isPending && testingId === wh.id}
                      >
                        <Play className="mr-1 h-4 w-4" />
                        Test
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditWebhook(wh)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(wh.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateWebhookSheet open={createOpen} onOpenChange={setCreateOpen} />

      <EditWebhookSheet
        webhook={editWebhook}
        open={!!editWebhook}
        onOpenChange={(open) => {
          if (!open) setEditWebhook(null);
        }}
      />

      <DeliveryLogsSheet
        webhook={logsWebhook}
        open={!!logsWebhook}
        onOpenChange={(open) => {
          if (!open) setLogsWebhook(null);
        }}
      />

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
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
              onClick={() => {
                if (deleteConfirm) {
                  deleteMutation.mutate(deleteConfirm);
                  setDeleteConfirm(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
