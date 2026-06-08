'use client';

import { useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { useAccountMappings, useUpdateAccountMapping } from '../hooks';
import type { AccountMapping } from '../types';

const LINE_ITEM_TYPE_LABELS: Record<string, string> = {
  LINEHAUL: 'Linehaul',
  FUEL_SURCHARGE: 'Fuel Surcharge',
  DETENTION_PICKUP: 'Detention (Pickup)',
  DETENTION_DELIVERY: 'Detention (Delivery)',
  LAYOVER: 'Layover',
  LUMPER: 'Lumper',
  TONU: 'TONU',
  ACCESSORIAL: 'Accessorial',
  ADJUSTMENT: 'Adjustment',
  DRIVER_PAY: 'Driver Pay',
  DEDUCTION: 'Deduction',
  FUEL_ADVANCE: 'Fuel Advance',
  CASH_ADVANCE: 'Cash Advance',
  INSURANCE: 'Insurance',
  EQUIPMENT_LEASE: 'Equipment Lease',
  ESCROW: 'Escrow',
};

function humanizeItemType(type: string): string {
  return LINE_ITEM_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface EditState {
  externalAccountId: string;
  externalAccountName: string;
}

interface EditRowProps {
  mapping: AccountMapping;
  onSave: (data: EditState) => void;
  onCancel: () => void;
  isPending: boolean;
}

function EditRow({ mapping, onSave, onCancel, isPending }: EditRowProps) {
  const [state, setState] = useState<EditState>({
    externalAccountId: mapping.externalAccountId,
    externalAccountName: mapping.externalAccountName,
  });

  return (
    <div className="space-y-2 py-1">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Account Name</Label>
        <Input
          value={state.externalAccountName}
          onChange={(e) => setState((prev) => ({ ...prev, externalAccountName: e.target.value }))}
          placeholder="e.g. Income:Freight Revenue"
          className="h-7 text-xs"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" className="h-7 text-xs" onClick={() => onSave(state)} loading={isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AccountMappingTab() {
  const { data: mappings, isLoading } = useAccountMappings();
  const updateMapping = useUpdateAccountMapping();
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleSave = (mappingId: number, data: EditState) => {
    updateMapping.mutate(
      { mappingId, data },
      {
        onSuccess: () => {
          setEditingId(null);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!mappings?.length) {
    return <div className="text-center py-12 text-muted-foreground">No account mappings found.</div>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Line Item Type</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead>QB Account</TableHead>
            <TableHead className="w-24">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((mapping) => (
            <TableRow key={mapping.id}>
              <TableCell className="font-medium text-foreground">{humanizeItemType(mapping.sallyItemType)}</TableCell>
              <TableCell>
                {mapping.direction === 'INCOME' ? (
                  <Badge variant="default" className="text-xs">
                    Income
                  </Badge>
                ) : (
                  <Badge variant="muted" className="text-xs">
                    Expense
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {editingId === mapping.id ? (
                  <EditRow
                    mapping={mapping}
                    onSave={(data) => handleSave(mapping.id, data)}
                    onCancel={() => setEditingId(null)}
                    isPending={updateMapping.isPending}
                  />
                ) : (
                  mapping.externalAccountName || <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {editingId !== mapping.id && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(mapping.id)}>
                    Change
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
