'use client';

import { ConnectionsTab } from '@/features/integrations';

export default function ConnectionsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Connections</h2>
        <p className="text-sm text-muted-foreground">Your connected services — telematics, accounting, and more</p>
      </div>

      <ConnectionsTab />
    </div>
  );
}
