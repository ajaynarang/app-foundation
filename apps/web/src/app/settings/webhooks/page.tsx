'use client';

import { WebhooksList } from '@/features/webhooks';

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Webhooks</h2>
        <p className="text-sm text-muted-foreground">Real-time event notifications for your systems</p>
      </div>

      <WebhooksList />
    </div>
  );
}
