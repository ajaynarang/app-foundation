'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useCustomFieldDefinitions } from '../hooks/use-custom-field-definitions';
import { FieldDefinitionCard } from './field-definition-card';
import { CustomFieldsEmptyState } from './empty-state';
import { CreateFieldSheet } from './create-field-sheet';
import { EditFieldSheet } from './edit-field-sheet';
import type { CustomFieldDefinition, CustomFieldEntityType } from '../types';

interface TabEntry {
  value: string;
  label: string;
  entityType: CustomFieldEntityType;
}

const TABS: TabEntry[] = [
  { value: 'LOAD', label: 'Loads', entityType: 'LOAD' },
  { value: 'DRIVER', label: 'Drivers', entityType: 'DRIVER' },
  { value: 'VEHICLE', label: 'Vehicles', entityType: 'VEHICLE' },
  { value: 'CUSTOMER', label: 'Customers', entityType: 'CUSTOMER' },
];

function DefinitionList({
  entityType,
  onEdit,
}: {
  entityType: CustomFieldEntityType;
  onEdit: (def: CustomFieldDefinition) => void;
}) {
  const { data: definitions, isLoading } = useCustomFieldDefinitions(entityType);
  const tabEntry = TABS.find((t) => t.entityType === entityType);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!definitions || definitions.length === 0) {
    return <CustomFieldsEmptyState entityLabel={tabEntry?.label} />;
  }

  return (
    <div className="space-y-2">
      {definitions.map((def) => (
        <FieldDefinitionCard key={def.id} definition={def} onEdit={onEdit} />
      ))}
    </div>
  );
}

export function CustomFieldSettingsPage() {
  const [activeTab, setActiveTab] = useState<CustomFieldEntityType>('LOAD');
  const [createOpen, setCreateOpen] = useState(false);
  const [editDefinition, setEditDefinition] = useState<CustomFieldDefinition | null>(null);

  const handleEdit = (def: CustomFieldDefinition) => {
    setEditDefinition(def);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Custom Fields</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define extra fields to capture additional data across your operations.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Field
        </Button>
      </div>

      {/* Tabs by entity type */}
      <Tabs value={activeTab as string} onValueChange={(v) => setActiveTab(v as CustomFieldEntityType)}>
        <TabsList className="w-full sm:w-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1 sm:flex-none">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            <DefinitionList entityType={tab.entityType} onEdit={handleEdit} />
          </TabsContent>
        ))}
      </Tabs>

      {/* Create sheet */}
      <CreateFieldSheet open={createOpen} onOpenChange={setCreateOpen} entityType={activeTab} />

      {/* Edit sheet */}
      {editDefinition && (
        <EditFieldSheet
          definition={editDefinition}
          open={!!editDefinition}
          onOpenChange={(open) => {
            if (!open) setEditDefinition(null);
          }}
        />
      )}
    </div>
  );
}
