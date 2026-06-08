'use client';

import { SlidersHorizontal } from 'lucide-react';

interface EmptyStateProps {
  entityLabel?: string;
}

export function CustomFieldsEmptyState({ entityLabel }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
        <SlidersHorizontal className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No custom fields yet</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        {entityLabel
          ? `Add custom fields to capture extra data on your ${entityLabel.toLowerCase()}s.`
          : 'Add custom fields to capture additional data for this entity type.'}
      </p>
    </div>
  );
}
