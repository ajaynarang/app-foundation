'use client';

import { useState } from 'react';
import { GripVertical, Type, Hash, CalendarDays, List, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { useCustomFieldUsageCount, useDeactivateCustomFieldDefinition } from '../hooks/use-custom-field-definitions';
import type { CustomFieldDefinition } from '../types';

const TYPE_ICONS: Record<string, React.ElementType> = {
  TEXT: Type,
  NUMBER: Hash,
  DATE: CalendarDays,
  SELECT: List,
};

const TYPE_LABELS: Record<string, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  DATE: 'Date',
  SELECT: 'Select',
};

interface FieldDefinitionCardProps {
  definition: CustomFieldDefinition;
  onEdit: (definition: CustomFieldDefinition) => void;
}

export function FieldDefinitionCard({ definition, onEdit }: FieldDefinitionCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: usageData } = useCustomFieldUsageCount(confirmOpen ? definition.id : null);
  const deactivate = useDeactivateCustomFieldDefinition();

  const TypeIcon = TYPE_ICONS[definition.fieldType as string];

  const handleDeactivate = () => {
    deactivate.mutate(definition.id, {
      onSuccess: () => setConfirmOpen(false),
    });
  };

  return (
    <>
      <div className="group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
        {/* Drag handle — visual only for now */}
        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 cursor-grab" />

        {/* Type icon */}
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
          {TypeIcon && <TypeIcon className="h-4 w-4 text-muted-foreground" />}
        </div>

        {/* Field info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{definition.name}</span>
            <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
              {definition.fieldKey}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge variant="muted" className="text-xs">
              {TYPE_LABELS[definition.fieldType as string] ?? (definition.fieldType as string)}
            </Badge>
            {definition.isRequired && (
              <Badge variant="outline" className="text-xs text-red-500 border-red-500/30">
                Required
              </Badge>
            )}
            {definition.driverEditable && (
              <Badge variant="outline" className="text-xs">
                Driver visible
              </Badge>
            )}
            {definition.showOnInvoice && (
              <Badge variant="outline" className="text-xs">
                Invoice
              </Badge>
            )}
            {definition.showOnBol && (
              <Badge variant="outline" className="text-xs">
                BOL
              </Badge>
            )}
          </div>
        </div>

        {/* Actions — reveal on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(definition)}
            aria-label={`Edit ${definition.name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Delete ${definition.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate custom field?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">{definition.name}</span> will be deactivated and hidden from
              new entries.
              {usageData && usageData.count > 0 && (
                <span className="block mt-2 text-caution-foreground">
                  This field has data on {usageData.count} existing {usageData.count === 1 ? 'record' : 'records'}.
                  Existing values will be preserved but no longer shown.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivate.isPending ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
