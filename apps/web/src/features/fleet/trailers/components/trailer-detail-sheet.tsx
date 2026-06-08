'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { DeactivationDialog, ReactivationDialog, DecommissionDialog } from '@/shared/components/deactivation-dialog';
import { TrailerStatusBadge } from './trailer-status-badge';
import { trailersApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { timeAgo } from '@/shared/lib/date-utils';
import { formatCalendarDate, DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { Trailer } from '../types';
import { Pencil, Truck, Shield, FileText, ExternalLink, MoreHorizontal, Ruler, Snowflake, Link2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@sally/ui/components/ui/dropdown-menu';

interface TrailerDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trailer: Trailer | null;
  onMutate?: () => void;
  onEdit?: (trailer: Trailer) => void;
}

export default function TrailerDetailSheet({ open, onOpenChange, trailer, onMutate, onEdit }: TrailerDetailSheetProps) {
  const sizing = useSheetSizing('trailer');
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [decommissionOpen, setDecommissionOpen] = useState(false);
  const [blockers, setBlockers] = useState<{ message: string; items: string[] } | null>(null);
  const [decommissionBlockers, setDecommissionBlockers] = useState<{ message: string; items: string[] } | null>(null);

  if (!trailer) return null;

  const equipmentLabel = trailer.equipmentType?.replace(/_/g, ' ') || 'Unknown';
  const ownershipLabels: Record<string, string> = {
    OWNED: 'Owned',
    LEASED: 'Leased',
    OWNER_OPERATOR: 'Owner-Operator',
  };
  const ownershipLabel = trailer.ownershipType ? ownershipLabels[trailer.ownershipType] : undefined;

  const handleDeactivate = async (reason: string) => {
    try {
      await trailersApi.deactivate(trailer.trailerId, reason);
      showSuccess('Trailer deactivated');
      setDeactivateOpen(false);
      setBlockers(null);
      onOpenChange(false);
      onMutate?.();
    } catch (err) {
      const e = err as {
        status?: number;
        data?: { message?: string; activeLoads?: Array<{ loadId: string; status: string }> };
      };
      if (e.status === 409) {
        const data = e.data;
        setBlockers({
          message: data?.message || 'Cannot deactivate trailer',
          items: data?.activeLoads?.map((l) => `Load ${l.loadId} (${l.status})`) || [],
        });
      } else {
        showError('Failed to deactivate trailer');
      }
    }
  };

  const handleReactivate = async () => {
    try {
      await trailersApi.reactivate(trailer.trailerId);
      showSuccess('Trailer reactivated');
      setReactivateOpen(false);
      onOpenChange(false);
      onMutate?.();
    } catch {
      showError('Failed to reactivate trailer');
    }
  };

  const handleDecommission = async (reason: string) => {
    try {
      await trailersApi.decommission(trailer.trailerId, reason);
      showSuccess('Trailer decommissioned');
      setDecommissionOpen(false);
      setDecommissionBlockers(null);
      onOpenChange(false);
      onMutate?.();
    } catch (err) {
      const e = err as {
        status?: number;
        data?: { message?: string; activeLoads?: Array<{ loadId: string; status: string }> };
      };
      if (e.status === 409) {
        const data = e.data;
        setDecommissionBlockers({
          message: data?.message || 'Cannot decommission trailer',
          items: data?.activeLoads?.map((l) => `Load ${l.loadId} (${l.status})`) || [],
        });
      } else {
        showError('Failed to decommission trailer');
      }
    }
  };

  const isActive = trailer.lifecycleStatus !== 'INACTIVE' && trailer.lifecycleStatus !== 'DECOMMISSIONED';
  const isInactive = trailer.lifecycleStatus === 'INACTIVE';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="w-full p-0 flex flex-col"
          pinnable
          resizable
          defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
        >
          {/* Header */}
          <SheetHeader
            sticky
            actions={
              <div className="flex items-center gap-1">
                {sizing.showControls && <SheetSizeControls entityType="trailer" />}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isActive && (
                      <DropdownMenuItem onClick={() => onEdit?.(trailer)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {isActive && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setDeactivateOpen(true)} className="text-caution">
                          Deactivate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDecommissionOpen(true)} className="text-critical">
                          Decommission
                        </DropdownMenuItem>
                      </>
                    )}
                    {isInactive && (
                      <DropdownMenuItem onClick={() => setReactivateOpen(true)}>Reactivate</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          >
            <div className="flex items-center gap-3">
              <SheetTitle className="text-lg truncate">Unit #{trailer.unitNumber}</SheetTitle>
              <Badge variant="outline" className="text-xs">
                {equipmentLabel}
              </Badge>
              <TrailerStatusBadge status={trailer.status} />
              {trailer.lifecycleStatus === 'INACTIVE' && <Badge variant="muted">Inactive</Badge>}
              {trailer.lifecycleStatus === 'DECOMMISSIONED' && <Badge variant="destructive">Decommissioned</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{trailer.trailerId}</p>
            <SheetDescription className="sr-only">Trailer details for Unit #{trailer.unitNumber}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Deactivation/Decommission Banner */}
            {(trailer.lifecycleStatus === 'INACTIVE' || trailer.lifecycleStatus === 'DECOMMISSIONED') && (
              <div
                className={`mx-6 mt-4 p-3 rounded-md ${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.border}`}
              >
                <p className={`text-sm font-medium ${SEMANTIC_COLORS.caution.text}`}>
                  Trailer {trailer.lifecycleStatus === 'DECOMMISSIONED' ? 'Decommissioned' : 'Deactivated'}
                </p>
              </div>
            )}

            {/* Content */}
            <div className="p-6 space-y-5">
              {/* Identification */}
              <SheetSection icon={Truck} title="Identification">
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="VIN" value={trailer.vin} mono />
                  <InfoItem
                    label="License Plate"
                    value={
                      trailer.licensePlate
                        ? `${trailer.licensePlate}${trailer.licensePlateState ? ` (${trailer.licensePlateState})` : ''}`
                        : undefined
                    }
                  />
                  <InfoItem label="Make" value={trailer.make} />
                  <InfoItem label="Model" value={trailer.model} />
                  <InfoItem label="Year" value={trailer.year?.toString()} />
                  {ownershipLabel && <InfoItem label="Ownership" value={ownershipLabel} />}
                </div>
              </SheetSection>

              {/* Equipment */}
              <SheetSection icon={Ruler} title="Equipment">
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="Length" value={trailer.lengthFeet ? `${trailer.lengthFeet} ft` : undefined} />
                  <InfoItem
                    label="Max Payload"
                    value={trailer.maxPayloadLbs ? `${trailer.maxPayloadLbs.toLocaleString()} lbs` : undefined}
                  />
                </div>
              </SheetSection>

              {/* Reefer Info (conditional) */}
              {trailer.equipmentType === 'REEFER' && (
                <SheetSection icon={Snowflake} title="Reefer Unit">
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem label="Make" value={trailer.reeferMake} />
                    <InfoItem label="Model" value={trailer.reeferModel} />
                    <InfoItem label="Serial" value={trailer.reeferSerial} mono />
                  </div>
                </SheetSection>
              )}

              {/* Current Assignment */}
              <SheetSection icon={Link2} title="Current Assignment">
                {trailer.assignedVehicle ? (
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground font-medium">
                      Unit #{trailer.assignedVehicle.unitNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">({trailer.assignedVehicle.vehicleId})</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not assigned to any vehicle</p>
                )}
              </SheetSection>

              {/* Compliance */}
              <SheetSection icon={Shield} title="Compliance">
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem
                    label="Registration Expiry"
                    value={
                      trailer.registrationExpiry
                        ? formatCalendarDate(trailer.registrationExpiry, DISPLAY_FORMATS.FRIENDLY)
                        : undefined
                    }
                  />
                  <InfoItem
                    label="Insurance Expiry"
                    value={
                      trailer.insuranceExpiry
                        ? formatCalendarDate(trailer.insuranceExpiry, DISPLAY_FORMATS.FRIENDLY)
                        : undefined
                    }
                  />
                  <InfoItem
                    label="Annual Inspection"
                    value={
                      trailer.annualInspectionDate
                        ? formatCalendarDate(trailer.annualInspectionDate, DISPLAY_FORMATS.FRIENDLY)
                        : undefined
                    }
                  />
                  <InfoItem
                    label="Next Maintenance"
                    value={
                      trailer.nextMaintenanceDate
                        ? formatCalendarDate(trailer.nextMaintenanceDate, DISPLAY_FORMATS.FRIENDLY)
                        : undefined
                    }
                  />
                </div>
              </SheetSection>

              {/* Notes */}
              {trailer.notes && (
                <SheetSection icon={FileText} title="Notes" defaultOpen={false}>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{trailer.notes}</p>
                </SheetSection>
              )}

              {/* Integration */}
              {(trailer.externalSource || trailer.externalTrailerId) && (
                <SheetSection icon={ExternalLink} title="Integration" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-3">
                    {trailer.externalSource && <InfoItem label="Source" value={trailer.externalSource} />}
                    {trailer.externalTrailerId && (
                      <InfoItem label="External ID" value={trailer.externalTrailerId} mono />
                    )}
                    <InfoItem
                      label="Last Synced"
                      value={trailer.lastSyncedAt ? timeAgo(trailer.lastSyncedAt) : 'Never'}
                    />
                  </div>
                </SheetSection>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <DeactivationDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        entityType="trailer"
        entityName={`Trailer ${trailer.unitNumber}`}
        onConfirm={handleDeactivate}
        blockers={blockers}
      />

      <ReactivationDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        entityName={`Trailer ${trailer.unitNumber}`}
        onConfirm={handleReactivate}
      />

      <DecommissionDialog
        open={decommissionOpen}
        onOpenChange={setDecommissionOpen}
        entityName={`Trailer ${trailer.unitNumber}`}
        onConfirm={handleDecommission}
        blockers={decommissionBlockers}
      />
    </>
  );
}
