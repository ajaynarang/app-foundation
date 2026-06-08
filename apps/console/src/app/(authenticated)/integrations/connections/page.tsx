'use client';

import { ConnectionsTab } from '../../../../features/integrations';
import { ConsoleFeatureGuard } from '@/components/feature-guard';

export default function IntegrationsConnectionsPage() {
  return (
    <ConsoleFeatureGuard entitlementKey="samsara_integration">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Connections</h1>
          <p className="text-muted-foreground mt-1">
            Manage your connected integrations -- telematics, accounting, and more.
          </p>
        </div>

        <ConnectionsTab />
      </div>
    </ConsoleFeatureGuard>
  );
}
