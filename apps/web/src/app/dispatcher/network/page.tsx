'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  PageHeader,
  PageTabs,
  PageTabsList,
  PageTabsTrigger,
  PageToolbar,
  TabsContent,
} from '@/shared/components/page-chrome';
import { Button } from '@sally/ui/components/ui/button';
import { Plus, Settings } from 'lucide-react';
import { CustomerList } from '@/features/fleet/customers/components/customer-list';
import { AddCustomerSheet } from '@/features/fleet/customers/components/add-customer-sheet';
import { LocationList } from '@/features/fleet/stops/components/location-list';
import { FactoringCompaniesSection } from '@/features/financials/invoicing/components/factoring-companies-section';
import { NoaInbox } from '@/features/financials/billing/components/noa-inbox';

type NetworkTab = 'customers' | 'locations' | 'factoring' | 'noa';

const TAB_VALUES: NetworkTab[] = ['customers', 'locations', 'factoring', 'noa'];

export default function NetworkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as NetworkTab | null;

  const [activeTab, setActiveTab] = useState<NetworkTab>(
    tabParam && TAB_VALUES.includes(tabParam) ? tabParam : 'customers',
  );
  // Page owns the per-tab add/settings dialogs so the CTAs live in the toolbar (Zone 2).
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [addFactoringOpen, setAddFactoringOpen] = useState(false);
  const [factoringSettingsOpen, setFactoringSettingsOpen] = useState(false);
  const [canEditFactoringSettings, setCanEditFactoringSettings] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', activeTab);
    router.replace(`/dispatcher/network?${params.toString()}`, { scroll: false });
  }, [activeTab, router, searchParams]);

  return (
    <div className="flex flex-col h-full">
      <PageTabs value={activeTab} onValueChange={(v) => setActiveTab(v as NetworkTab)} className="flex flex-col h-full">
        <div className="space-y-4 px-4 pt-4 pb-2">
          <PageHeader title="Network" subtitle="Customers, locations, and factoring partners" hasTabs />
          <PageToolbar
            tabs={
              <PageTabsList>
                <PageTabsTrigger value="customers">Customers</PageTabsTrigger>
                <PageTabsTrigger value="locations">Locations</PageTabsTrigger>
                <PageTabsTrigger value="factoring">Factoring</PageTabsTrigger>
                <PageTabsTrigger value="noa">NOA Inbox</PageTabsTrigger>
              </PageTabsList>
            }
            primaryAction={
              activeTab === 'customers' ? (
                <Button size="sm" onClick={() => setAddCustomerOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Customer</span>
                </Button>
              ) : activeTab === 'locations' ? (
                <Button size="sm" onClick={() => setAddLocationOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Location</span>
                </Button>
              ) : activeTab === 'factoring' ? (
                <Button size="sm" onClick={() => setAddFactoringOpen(true)}>
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Add Company</span>
                </Button>
              ) : undefined
            }
            secondaryActions={
              activeTab === 'factoring' && canEditFactoringSettings ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setFactoringSettingsOpen(true)}
                  aria-label="Factoring settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              ) : undefined
            }
          />
        </div>

        <TabsContent value="customers" className="flex-1 overflow-auto mt-0">
          <div className="pt-2 px-4">
            <CustomerList />
          </div>
        </TabsContent>

        <TabsContent value="locations" className="flex-1 overflow-auto mt-0">
          <div className="pt-2 px-4">
            <LocationList actionsInToolbar createOpen={addLocationOpen} onCreateOpenChange={setAddLocationOpen} />
          </div>
        </TabsContent>

        <TabsContent value="factoring" className="flex-1 overflow-auto mt-0">
          <div className="pt-2 px-4">
            <FactoringCompaniesSection
              actionsInToolbar
              createOpen={addFactoringOpen}
              onCreateOpenChange={setAddFactoringOpen}
              settingsOpen={factoringSettingsOpen}
              onSettingsOpenChange={setFactoringSettingsOpen}
              onCanEditSettingsChange={setCanEditFactoringSettings}
            />
          </div>
        </TabsContent>

        <TabsContent value="noa" className="flex-1 overflow-auto mt-0">
          <div className="pt-2 px-4">
            <NoaInbox />
          </div>
        </TabsContent>
      </PageTabs>

      <AddCustomerSheet open={addCustomerOpen} onOpenChange={setAddCustomerOpen} />
    </div>
  );
}
