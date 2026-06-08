'use client';

import { WebhooksList } from '@/features/webhooks/components/webhooks-list';
import { ConsoleFeatureGuard } from '@/components/feature-guard';

export default function WebhooksPage() {
  return (
    <ConsoleFeatureGuard entitlementKey="webhooks">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Webhooks</h1>
          <p className="text-muted-foreground mt-1">
            Receive real-time notifications when events happen in your SALLY account.
          </p>
        </div>

        <WebhooksList />
      </div>
    </ConsoleFeatureGuard>
  );
}
