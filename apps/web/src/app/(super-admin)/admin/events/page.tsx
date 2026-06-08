'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { EventStreamTable, WebhookHealthTable, EventVolumeChart } from '@/features/admin-events';

export default function AdminEventsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Domain Events</h1>
        <p className="text-muted-foreground mt-1 text-sm md:text-base">
          Monitor domain event activity, webhook deliveries, and event volume across all tenants
        </p>
      </div>

      <Tabs defaultValue="stream">
        <TabsList>
          <TabsTrigger value="stream">Event Stream</TabsTrigger>
          <TabsTrigger value="webhooks">Webhook Health</TabsTrigger>
          <TabsTrigger value="volume">Event Volume</TabsTrigger>
        </TabsList>

        <TabsContent value="stream" className="space-y-6 mt-6">
          <EventStreamTable />
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6 mt-6">
          <WebhookHealthTable />
        </TabsContent>

        <TabsContent value="volume" className="space-y-6 mt-6">
          <EventVolumeChart />
        </TabsContent>
      </Tabs>
    </div>
  );
}
