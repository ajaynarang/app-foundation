'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Textarea } from '@app/ui/components/ui/textarea';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@app/ui/components/ui/sheet';
import { Copy, AlertCircle, Check } from 'lucide-react';
import { useCreateWebhook, type WebhookCreatedResponse } from '../use-webhooks';
import { EventPicker } from './event-picker';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWebhookSheet({ open, onOpenChange }: Props) {
  const createMutation = useCreateWebhook();

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [wildcard, setWildcard] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [createdWebhook, setCreatedWebhook] = useState<WebhookCreatedResponse | null>(null);
  const [copied, setCopied] = useState<'id' | 'secret' | null>(null);

  function reset() {
    setUrl('');
    setDescription('');
    setWildcard(false);
    setSelectedEvents([]);
    setCreatedWebhook(null);
    setCopied(null);
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  async function handleSubmit() {
    try {
      const events = wildcard ? ['*'] : selectedEvents;
      const result = await createMutation.mutateAsync({
        url,
        events,
        description: description || undefined,
      });
      setCreatedWebhook(result);
    } catch {
      // Error toast is handled by the mutation's onError callback
    }
  }

  function handleCopy(value: string, type: 'id' | 'secret') {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  const isValidUrl = url.trim().startsWith('https://') && url.trim().length > 10;
  const canSubmit = isValidUrl && (wildcard || selectedEvents.length > 0);

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        className="w-full sm:max-w-lg overflow-y-auto"
        onInteractOutside={(e) => {
          if (!createdWebhook) e.preventDefault();
        }}
        pinnable
        resizable
        defaultPinned
      >
        {!createdWebhook ? (
          <>
            <SheetHeader>
              <SheetTitle>Create Webhook</SheetTitle>
              <SheetDescription>Subscribe to events and receive HTTP POST callbacks when they occur.</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Endpoint URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://your-app.com/webhooks"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="font-mono"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Must be HTTPS. Private/localhost URLs are blocked.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webhook-description">Description (optional)</Label>
                <Textarea
                  id="webhook-description"
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
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} loading={createMutation.isPending}>
                Create Webhook
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Webhook Created</SheetTitle>
              <SheetDescription>Save the signing secret now. You will not be able to see it again.</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Webhook ID</Label>
                <code className="block rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {createdWebhook.id}
                </code>
              </div>

              <div className="space-y-2">
                <Label>Signing Secret</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {createdWebhook.signingSecret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(createdWebhook.signingSecret, 'secret')}
                  >
                    {copied === 'secret' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Store this secret securely. You will need it to verify webhook signatures. It will not be shown again.
                </AlertDescription>
              </Alert>
            </div>

            <SheetFooter className="mt-6">
              <Button onClick={() => handleClose(false)}>Done</Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
