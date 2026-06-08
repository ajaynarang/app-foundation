'use client';

import { useCallback, useState } from 'react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { useEntityMappings, useConfirmEntityMapping, useUpdateEntityMapping, useExternalEntities } from '../hooks';
import { EntityPicker } from './entity-picker';
import type { EntityMapping, ExternalEntity } from '../types';

interface EditRowState {
  externalId: string;
  externalName: string;
}

interface EntityMatchingTabProps {
  entityType: 'customer' | 'vendor' | 'class';
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null;
  const pct = Math.round(confidence * 100);
  if (pct >= 90) return <Badge className="text-xs bg-muted text-foreground">{pct}%</Badge>;
  if (pct >= 80) return <Badge className="text-xs bg-caution/10 text-caution">{pct}%</Badge>;
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      {pct}%
    </Badge>
  );
}

export function EntityMatchingTab({ entityType }: EntityMatchingTabProps) {
  const { data: mappings, isLoading: mappingsLoading } = useEntityMappings(entityType);
  const { data: externalEntities = [], isLoading: entitiesLoading } = useExternalEntities(entityType);
  const confirmMapping = useConfirmEntityMapping();
  const updateMapping = useUpdateEntityMapping();

  const [, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditRowState>({ externalId: '', externalName: '' });

  const _handleStartEdit = (mapping: EntityMapping) => {
    setEditingId(mapping.id);
    setEditState({ externalId: mapping.externalId ?? '', externalName: mapping.externalName ?? '' });
  };

  const _handleCancelEdit = () => {
    setEditingId(null);
    setEditState({ externalId: '', externalName: '' });
  };

  const _handleSaveEdit = (mappingId: number) => {
    updateMapping.mutate(
      { mappingId, data: editState },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditState({ externalId: '', externalName: '' });
        },
      },
    );
  };

  const handlePick = useCallback(
    (mappingId: number, entity: ExternalEntity | null) => {
      updateMapping.mutate({
        mappingId,
        data: {
          externalId: entity?.externalId ?? '',
          externalName: entity?.externalName ?? '',
        },
      });
    },
    [updateMapping],
  );

  const handleConfirm = useCallback((mappingId: number) => confirmMapping.mutate(mappingId), [confirmMapping]);

  const handleConfirmAll = useCallback(() => {
    if (!mappings) return;
    mappings.filter((m) => !m.confirmedAt && m.externalId).forEach((m) => confirmMapping.mutate(m.id));
  }, [mappings, confirmMapping]);

  if (mappingsLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!mappings?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">No entity mappings found. Sync your data first.</div>
    );
  }

  const hasConfirmable = mappings.some((m) => !m.confirmedAt && m.externalId);
  const entityLabel = entityType === 'customer' ? 'QB Customer' : entityType === 'vendor' ? 'QB Vendor' : 'QB Class';

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SALLY Name</TableHead>
              <TableHead>{entityLabel}</TableHead>
              <TableHead className="hidden sm:table-cell w-20">Confidence</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping) => (
              <MappingRow
                key={mapping.id}
                mapping={mapping}
                externalEntities={externalEntities}
                entitiesLoading={entitiesLoading}
                onPick={handlePick}
                onConfirm={handleConfirm}
                isConfirmPending={confirmMapping.isPending && confirmMapping.variables === mapping.id}
                isUpdatePending={updateMapping.isPending}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {hasConfirmable && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleConfirmAll} loading={confirmMapping.isPending}>
            Confirm All Matched
          </Button>
        </div>
      )}
    </div>
  );
}

interface MappingRowProps {
  mapping: EntityMapping;
  externalEntities: ExternalEntity[];
  entitiesLoading: boolean;
  onPick: (mappingId: number, entity: ExternalEntity | null) => void;
  onConfirm: (mappingId: number) => void;
  isConfirmPending: boolean;
  isUpdatePending: boolean;
}

function MappingRow({
  mapping,
  externalEntities,
  entitiesLoading,
  onPick,
  onConfirm,
  isConfirmPending,
  isUpdatePending,
}: MappingRowProps) {
  const isConfirmed = !!mapping.confirmedAt;
  const hasMatch = !!mapping.externalId;

  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">{mapping.sallyEntityName}</TableCell>

      <TableCell>
        {isConfirmed ? (
          <span className="text-sm text-foreground">{mapping.externalName}</span>
        ) : (
          <EntityPicker
            value={mapping.externalId}
            entities={externalEntities}
            isLoading={entitiesLoading}
            placeholder="Select QB entity..."
            onSelect={(entity) => onPick(mapping.id, entity)}
          />
        )}
      </TableCell>

      <TableCell className="hidden sm:table-cell">
        <ConfidenceBadge confidence={mapping.matchConfidence} />
      </TableCell>

      <TableCell>
        {isConfirmed ? (
          <Badge variant="outline" className="text-xs text-muted-foreground border-border">
            Confirmed
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Pending
          </Badge>
        )}
      </TableCell>

      <TableCell>
        {isConfirmed ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => onPick(mapping.id, null)}
            disabled={isUpdatePending}
          >
            Change
          </Button>
        ) : (
          hasMatch && (
            <Button size="sm" className="h-7 text-xs" onClick={() => onConfirm(mapping.id)} loading={isConfirmPending}>
              Confirm
            </Button>
          )
        )}
      </TableCell>
    </TableRow>
  );
}
