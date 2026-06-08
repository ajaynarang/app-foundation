'use client';

import { RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Button } from '@sally/ui/components/ui/button';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { EntityMatchingTab } from './entity-matching-tab';
import { AccountMappingTab } from './account-mapping-tab';
import { useAccountingStatus, useInitialSync } from '../hooks';

export function AccountingSetupContent() {
  const { formatTimestamp } = useFormatters();
  const { data: status } = useAccountingStatus();
  const initialSync = useInitialSync();

  return (
    <div>
      {status?.connected && (
        <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3 mb-4">
          <div>
            <p className="text-sm font-medium">{status.companyName ?? 'QuickBooks'}</p>
            <p className="text-xs text-muted-foreground">
              Last synced: {status.lastSyncedAt ? formatTimestamp(status.lastSyncedAt) : 'Never'}
            </p>
          </div>
          <Button size="sm" variant="outline" loading={initialSync.isPending} onClick={() => initialSync.mutate()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Sync Entities
          </Button>
        </div>
      )}

      <Tabs defaultValue="customers">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-4">
          <EntityMatchingTab entityType="customer" />
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <EntityMatchingTab entityType="vendor" />
        </TabsContent>

        <TabsContent value="vehicles" className="mt-4">
          <EntityMatchingTab entityType="class" />
        </TabsContent>

        <TabsContent value="accounts" className="mt-4">
          <AccountMappingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
