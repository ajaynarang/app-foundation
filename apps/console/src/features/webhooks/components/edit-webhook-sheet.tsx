'use client';

import { useState, useEffect } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@sally/ui/components/ui/sheet';
import { useUpdateWebhook, type WebhookSubscription } from '../use-webhooks';
import { EventPicker } from './event-picker';

interface Props {
  webhook: WebhookSubscription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWebhookSheet({ webhook, open, onOpenChange }: Props) {
  const updateMutation = useUpdateWebhook();

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [wildcard, setWildcard] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  useEffect(() => {
    if (webhook && open) {
      setUrl(webhook.url);
      setDescription(webhook.description ?? '');
      if (webhook.events.includes('*')) {
        setWildcard(true);
        setSelectedEvents([]);
      } else {
        setWildcard(false);
        setSelectedEvents(webhook.events);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook?.id, open]);

  async function handleSubmit() {
    if (!webhook) return;
    try {
      const events = wildcard ? ['*'] : selectedEvents;
      await updateMutation.mutateAsync({
        id: webhook.id,
        data: {
          url,
          events,
          description: description || undefined,
        },
      });
      onOpenChange(false);
    } catch {
      // Error toast is handled by the mutation's onError callback
    }
  }

  const isValidUrl = url.trim().startsWith('https://') && url.trim().length > 10;
  const canSubmit = isValidUrl && (wildcard || selectedEvents.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-lg overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        pinnable
        resizable
        defaultPinned
      >
        <SheetHeader>
          <SheetTitle>Edit Webhook</SheetTitle>
          <SheetDescription>Update the endpoint URL, events, or description.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="edit-webhook-url">Endpoint URL</Label>
            <Input
              id="edit-webhook-url"
              placeholder="https://your-app.com/webhooks"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-webhook-description">Description (optional)</Label>
            <Textarea
              id="edit-webhook-description"
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
        </div>

        <SheetFooter className="mt-6 sticky bottom-0 bg-background pb-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} loading={updateMutation.isPending}>
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
