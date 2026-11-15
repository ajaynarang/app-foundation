'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { WebhooksList } from '@/features/webhooks';
import { CreateWebhookSheet } from '@/features/webhooks/components/create-webhook-sheet';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { PageHeader } from '@/shared/components/page-chrome';

export default function WebhooksPage() {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <FeatureGuard featureKey="webhooks">
      <div className="space-y-6">
        <PageHeader
          title="Webhooks"
          subtitle="Events pushed to your systems the moment they happen"
          actions={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create webhook
            </Button>
          }
        />
        <WebhooksList onCreate={() => setCreateOpen(true)} />
        <CreateWebhookSheet open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    </FeatureGuard>
  );
}
