'use client';

import { Webhook, ArrowRight } from 'lucide-react';

export function WebhookManager() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3 my-4">
      <Webhook className="h-8 w-8 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">Webhook management has moved to Console.</p>
      <a
        href="/integrations/webhooks"
        className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
      >
        Manage Webhooks
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}
