'use client';

import { useState, useEffect, useCallback } from 'react';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@sally/ui/components/ui/radio-group';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { CollapsibleDocumentsSection } from '@/features/fleet/documents';
import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DeactivationDialog, ReactivationDialog, DecommissionDialog } from '@/shared/components/deactivation-dialog';
import { vehiclesApi } from '../api';
import { listDrivers, type Driver } from '@/features/fleet/drivers';
import { useReferenceData } from '@/features/platform/reference-data';
import { showSuccess, showError } from '@sally/ui';
import type { Vehicle } from '../types';
import {
  AlertCircle,
  Pencil,
  Truck,
  Fuel,
  ExternalLink,
  Satellite,
  Activity,
  Link2,
  Link2Off,
  Unlink,
  FileText,
  Paperclip,
  UserMinus,
  RotateCcw,
  XCircle,
  MoreHorizontal,
  Lock,
  Shield,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@sally/ui/components/ui/dropdown-menu';
import { timeAgo } from '@/shared/lib/date-utils';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { useLinkVehicle, useUnlinkVehicle } from '../../hooks/use-eld-linking';
import { EldLinkDialog } from '../../components/eld-link-dialog';
import { useIntegrations } from '@/features/integrations/hooks/use-integrations';

interface VehicleDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null;
  onMutate?: () => void;
}

export default function VehicleDetailSheet({ open, onOpenChange, vehicle, onMutate }: VehicleDetailSheetProps) {
  const { formatTimestamp } = useFormatters();
  const { data: refData } = useReferenceData(['equipment_type', 'us_state']);
  const [isEditing, setIsEditingRaw] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [eldLinkDialogOpen, setEldLinkDialogOpen] = useState(false);
  const [eldCandidates, setEldCandidates] = useState<{ eldId: string; name: string; detail: string }[]>([]);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [decommissionOpen, setDecommissionOpen] = useState(false);
  const [blockers, setBlockers] = useState<{ message: string; items: string[] } | null>(null);
  const [decommissionBlockers, setDecommissionBlockers] = useState<{ message: string; items: string[] } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const linkVehicle = useLinkVehicle();
  const unlinkVehicle = useUnlinkVehicle();
  const { data: integrations } = useIntegrations();
  const hasEldIntegration =
    integrations?.some(
      (i) => i.integrationType === 'ELD' && i.isEnabled && ['ACTIVE', 'CONFIGURED'].includes(i.status),
    ) ?? false;

  const setIsEditing = useCallback((editing: boolean) => {
    setIsEditingRaw(editing);
  }, []);

  // Fetch drivers for assignment dropdown
  useEffect(() => {
    listDrivers()
      .then(setDrivers)
      .catch(() => {});
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editForm, setEditForm] = useState<any>({
    unitNumber: '',
    vin: '',
    equipmentType: undefined,
    ownershipType: undefined,
    fuelCapacityGallons: '',
    mpg: undefined,
    status: 'AVAILABLE',
    make: '',
    model: '',
    year: undefined,
    licensePlate: '',
    licensePlateState: '',
    hasSleeperBerth: true,
    grossWeightLbs: undefined,
    assignedDriverId: null,
    notes: '',
    registrationExpiry: '',
    insuranceExpiry: '',
    annualInspectionDate: '',
    nextMaintenanceDate: '',
    customFieldValues: {},
  });

  const initEditForm = useCallback(() => {
    if (!vehicle) return;
    setSaveError(null);
    setEditForm({
      unitNumber: vehicle.unitNumber || '',
      vin: vehicle.vin || '',
      equipmentType: vehicle.equipmentType || undefined,
      ownershipType: vehicle.ownershipType || undefined,
      fuelCapacityGallons: vehicle.fuelCapacityGallons || '',
      mpg: vehicle.mpg || undefined,
      status: vehicle.status || 'AVAILABLE',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || undefined,
      licensePlate: vehicle.licensePlate || '',
      licensePlateState: vehicle.licensePlateState || '',
      hasSleeperBerth: vehicle.hasSleeperBerth ?? true,
      grossWeightLbs: vehicle.grossWeightLbs || undefined,
      assignedDriverId: vehicle.assignedDriverId ?? null,
      notes: vehicle.notes || '',
      registrationExpiry: vehicle.registrationExpiry
        ? new Date(vehicle.registrationExpiry).toISOString().split('T')[0]
        : '',
      insuranceExpiry: vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toISOString().split('T')[0] : '',
      annualInspectionDate: vehicle.annualInspectionDate
        ? new Date(vehicle.annualInspectionDate).toISOString().split('T')[0]
        : '',
      nextMaintenanceDate: vehicle.nextMaintenanceDate
        ? new Date(vehicle.nextMaintenanceDate).toISOString().split('T')[0]
        : '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customFieldValues: (vehicle as any).customFieldValues ?? {},
    });
  }, [vehicle]);

  const handleSave = async () => {
    if (!vehicle) return;
    setSaveError(null);
    const isTmsSynced = !!vehicle.externalSource;

    // VIN validation — only for manual vehicles
    if (!isTmsSynced) {
      const cleanVin = editForm.vin?.toUpperCase().replace(/\s/g, '') || '';
      if (cleanVin.length !== 17) {
        showError('VIN must be exactly 17 characters');
        return;
      }
    }

    setIsSaving(true);
    try {
      const complianceDates = {
        registrationExpiry: editForm.registrationExpiry?.trim()
          ? new Date(editForm.registrationExpiry).toISOString()
          : undefined,
        insuranceExpiry: editForm.insuranceExpiry?.trim()
          ? new Date(editForm.insuranceExpiry).toISOString()
          : undefined,
        annualInspectionDate: editForm.annualInspectionDate?.trim()
          ? new Date(editForm.annualInspectionDate).toISOString()
          : undefined,
        nextMaintenanceDate: editForm.nextMaintenanceDate?.trim()
          ? new Date(editForm.nextMaintenanceDate).toISOString()
          : undefined,
      };

      if (isTmsSynced) {
        await vehiclesApi.update(vehicle.vehicleId, {
          equipmentType: editForm.equipmentType,
          ownershipType: editForm.ownershipType,
          fuelCapacityGallons: editForm.fuelCapacityGallons,
          mpg: editForm.mpg,
          status: editForm.status,
          hasSleeperBerth: editForm.hasSleeperBerth,
          grossWeightLbs: editForm.grossWeightLbs,
          assignedDriverId: editForm.assignedDriverId,
          notes: editForm.notes?.trim() || undefined,
          ...(editForm.customFieldValues !== undefined && { customFieldValues: editForm.customFieldValues }),
          ...complianceDates,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      } else {
        await vehiclesApi.update(vehicle.vehicleId, {
          ...editForm,
          vin: editForm.vin?.toUpperCase().replace(/\s/g, ''),
          make: editForm.make || undefined,
          model: editForm.model || undefined,
          licensePlate: editForm.licensePlate || undefined,
          licensePlateState: editForm.licensePlateState || undefined,
          assignedDriverId: editForm.assignedDriverId,
          notes: editForm.notes?.trim() || undefined,
          ...complianceDates,
        });
      }
      setIsEditing(false);
      showSuccess('Vehicle updated');
      onMutate?.();
    } catch (err) {
      setSaveError(extractErrorMessage(err));
      showError(err instanceof Error ? err.message : 'Failed to update vehicle');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset edit state on vehicle change
  useEffect(() => {
    setIsEditing(false);
  }, [vehicle?.vehicleId, setIsEditing]);

  if (!vehicle) return null;

  const isTmsSynced = !!vehicle.externalSource;
  const equipmentLabel = vehicle.equipmentType?.replace(/_/g, ' ') || 'Unknown';
  const ownershipLabels: Record<string, string> = {
    OWNED: 'Owned',
    LEASED: 'Leased',
    OWNER_OPERATOR: 'Owner-Operator',
  };
  const ownershipLabel = vehicle.ownershipType ? ownershipLabels[vehicle.ownershipType] : undefined;
  const fuelPercent =
    vehicle.fuelCapacityGallons && vehicle.currentFuelGallons
      ? Math.round((vehicle.currentFuelGallons / vehicle.fuelCapacityGallons) * 100)
      : null;

  const parsedId = typeof vehicle.id === 'string' ? parseInt(vehicle.id, 10) : vehicle.id;
  const vehicleEntityId = Number.isNaN(parsedId) ? null : parsedId;

  const equipmentTypes = refData?.equipment_type?.map((item) => ({
    value: item.code,
    label: item.label,
  })) || [
    { value: 'DRY_VAN', label: 'Dry Van' },
    { value: 'FLATBED', label: 'Flatbed' },
    { value: 'REEFER', label: 'Reefer' },
    { value: 'STEP_DECK', label: 'Step Deck' },
    { value: 'POWER_ONLY', label: 'Power Only' },
    { value: 'OTHER', label: 'Other' },
  ];

  const usStates = refData?.us_state?.map((item) => item.code) || [
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'OR',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WA',
    'WV',
    'WI',
    'WY',
  ];

  const handleLinkEld = () => {
    if (!vehicle) return;
    linkVehicle.mutate(
      { vehicleDbId: vehicle.id, eldId: undefined },
      {
        onSuccess: (data) => {
          if (!data.linked && data.candidates) {
            setEldCandidates(data.candidates);
            setEldLinkDialogOpen(true);
          }
        },
      },
    );
  };

  const handleManualLink = (eldId: string) => {
    if (!vehicle) return;
    linkVehicle.mutate(
      { vehicleDbId: vehicle.id, eldId },
      {
        onSuccess: (data) => {
          if (data.linked) setEldLinkDialogOpen(false);
        },
      },
    );
  };

  const handleUnlinkEld = () => {
    if (!vehicle) return;
    unlinkVehicle.mutate(vehicle.id);
  };

  const handleDeactivate = async (reason: string) => {
    try {
      await vehiclesApi.deactivate(vehicle.vehicleId, reason);
      showSuccess('Vehicle deactivated');
      setDeactivateOpen(false);
      setBlockers(null);
      onOpenChange(false);
      onMutate?.();
    } catch (err) {
      const e = err as {
        status?: number;
        data?: {
          message?: string;
          activeLoads?: Array<{ loadId: string; status: string }>;
          activeRoutePlans?: string[];
        };
      };
      if (e.status === 409) {
        const data = e.data;
        setBlockers({
          message: data?.message ?? '',
          items: [
            ...(data?.activeLoads || []).map((l) => `Load ${l.loadId} (${l.status})`),
            ...(data?.activeRoutePlans || []).map((rp: string) => `Route Plan ${rp}`),
          ],
        });
      } else {
        showError('Failed to deactivate vehicle');
      }
    }
  };

  const handleReactivate = async () => {
    try {
      await vehiclesApi.reactivate(vehicle.vehicleId);
      showSuccess('Vehicle reactivated');
      setReactivateOpen(false);
      onOpenChange(false);
      onMutate?.();
    } catch {
      showError('Failed to reactivate vehicle');
    }
  };

  const handleDecommission = async (reason: string) => {
    try {
      await vehiclesApi.decommission(vehicle.vehicleId, reason);
      showSuccess('Vehicle decommissioned');
      setDecommissionOpen(false);
      setDecommissionBlockers(null);
      onOpenChange(false);
      onMutate?.();
    } catch (err) {
      const e = err as {
        status?: number;
        data?: {
          message?: string;
          activeLoads?: Array<{ loadId: string; status: string }>;
          activeRoutePlans?: string[];
        };
      };
      if (e.status === 409) {
        const data = e.data;
        setDecommissionBlockers({
          message: data?.message ?? '',
          items: [
            ...(data?.activeLoads || []).map((l) => `Load ${l.loadId} (${l.status})`),
            ...(data?.activeRoutePlans || []).map((rp: string) => `Route Plan ${rp}`),
          ],
        });
      } else {
        showError('Failed to decommission vehicle');
      }
    }
  };

  const eldMeta = vehicle.eldTelematicsMetadata as { eldId?: string; eldVendor?: string; lastSyncAt?: string } | null;
  const isEldLinked = !!eldMeta?.eldId;

  const viewModeHeaderActions = (
    <>
      {(() => {
        const lc = vehicle.lifecycleStatus;
        const ext = vehicle.externalSource;
        const showReactivate = lc === 'INACTIVE';
        const showDeactivate = !ext && lc !== 'INACTIVE' && lc !== 'DECOMMISSIONED';
        const showDecommission = !ext && lc !== 'DECOMMISSIONED';
        if (!showReactivate && !showDeactivate && !showDecommission) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {showReactivate && (
                <DropdownMenuItem onClick={() => setReactivateOpen(true)}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reactivate
                </DropdownMenuItem>
              )}
              {showReactivate && (showDeactivate || showDecommission) && <DropdownMenuSeparator />}
              {showDeactivate && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeactivateOpen(true)}
                >
                  <UserMinus className="h-4 w-4 mr-2" />
                  Deactivate
                </DropdownMenuItem>
              )}
              {showDecommission && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDecommissionOpen(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Decommission
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })()}
      <Button
        size="sm"
        onClick={() => {
          initEditForm();
          setIsEditing(true);
        }}
      >
        <Pencil className="h-4 w-4 mr-1" />
        Edit
      </Button>
    </>
  );

  return (
    <>
      <FormSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`Unit #${vehicle.unitNumber}`}
        description={vehicle.vehicleId}
        mode={isEditing ? 'edit' : 'view'}
        onSubmit={handleSave}
        submitLabel="Save Changes"
        isSubmitting={isSaving}
        onCancel={() => setIsEditing(false)}
        entityType="vehicle"
        footerExtra={!isEditing ? viewModeHeaderActions : undefined}
        headerActions={
          <div className="flex items-center gap-2">
            <Badge
              variant={
                vehicle.status === 'AVAILABLE'
                  ? 'default'
                  : vehicle.status === 'OUT_OF_SERVICE'
                    ? 'destructive'
                    : 'outline'
              }
            >
              {vehicle.status?.replace(/_/g, ' ') || 'Unknown'}
            </Badge>
            {vehicle.lifecycleStatus === 'INACTIVE' && <Badge variant="muted">Inactive</Badge>}
            {vehicle.lifecycleStatus === 'DECOMMISSIONED' && <Badge variant="destructive">Decommissioned</Badge>}
          </div>
        }
      >
        {/* Deactivation/Decommission Banner */}
        {(vehicle.lifecycleStatus === 'INACTIVE' || vehicle.lifecycleStatus === 'DECOMMISSIONED') && (
          <div className={`p-3 rounded-md mb-4 ${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.border}`}>
            <p className={`text-sm font-medium ${SEMANTIC_COLORS.caution.text}`}>
              Vehicle {vehicle.lifecycleStatus === 'DECOMMISSIONED' ? 'Decommissioned' : 'Deactivated'}
            </p>
            {vehicle.deactivationReason && (
              <p className="text-sm text-muted-foreground mt-1">Reason: {vehicle.deactivationReason}</p>
            )}
            {vehicle.deactivatedAt && (
              <p className="text-xs text-muted-foreground mt-1">Since {formatTimestamp(vehicle.deactivatedAt)}</p>
            )}
          </div>
        )}

        {/* TMS Lock Banner */}
        {isEditing && isTmsSynced && (
          <Alert className="mb-4 bg-info/10 border-info/20">
            <AlertDescription className="text-sm text-foreground">
              <Lock className="h-3 w-3 inline mr-1" />
              Some fields are managed by <span className="font-medium">{vehicle.externalSource}</span> and cannot be
              edited here.
            </AlertDescription>
          </Alert>
        )}

        {isEditing && saveError && (
          <Alert className="mb-4 bg-destructive/10 border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-sm">{saveError}</AlertDescription>
          </Alert>
        )}

        {/* Content */}
        <div className="space-y-5">
          {/* 1. Telematics — always view-only */}
          <SheetSection icon={Satellite} title="Telematics">
            {vehicle.telematics ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Location</span>
                  <span className="text-foreground">
                    {vehicle.telematics.latitude !== 0 && vehicle.telematics.longitude !== 0
                      ? `${vehicle.telematics.latitude.toFixed(4)}, ${vehicle.telematics.longitude.toFixed(4)}`
                      : 'No GPS data'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Speed</span>
                  <span className="text-foreground">
                    {vehicle.telematics.speed > 0
                      ? `${vehicle.telematics.speed.toFixed(0)} mph`
                      : vehicle.telematics.engineRunning
                        ? '0 mph'
                        : 'Parked'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Engine</span>
                  <span className={vehicle.telematics.engineRunning ? 'text-info' : 'text-muted-foreground'}>
                    {vehicle.telematics.engineRunning ? 'Running' : 'Off'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Odometer</span>
                  <span className="text-foreground">
                    {vehicle.telematics.odometer > 0
                      ? `${vehicle.telematics.odometer.toLocaleString(undefined, { maximumFractionDigits: 0 })} mi`
                      : '\u2014'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fuel Level</span>
                  <span className="text-foreground">
                    {vehicle.telematics.fuelLevel != null ? `${vehicle.telematics.fuelLevel.toFixed(0)}%` : '\u2014'}
                  </span>
                </div>
                {vehicle.telematics.timestamp && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-muted-foreground text-xs">{timeAgo(vehicle.telematics.timestamp)}</span>
                  </div>
                )}
              </div>
            ) : vehicle.eldTelematicsMetadata ? (
              <p className="text-sm text-muted-foreground">Telematics data pending sync</p>
            ) : (
              <p className="text-sm text-muted-foreground">No telematics data. Link an ELD to enable.</p>
            )}
          </SheetSection>

          {/* 2. Operations */}
          <SheetSection icon={Activity} title="Operations">
            {isEditing ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Primary Driver</Label>
                    <Select
                      value={editForm.assignedDriverId?.toString() || 'none'}
                      onValueChange={(val) =>
                        setEditForm({ ...editForm, assignedDriverId: val === 'none' ? null : parseInt(val) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select driver..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={d.id.toString()}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4">
                  <Label className="mb-3 block">Status</Label>
                  <RadioGroup
                    value={editForm.status || 'AVAILABLE'}
                    onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="AVAILABLE" id="status-available" />
                      <Label htmlFor="status-available" className="font-normal cursor-pointer">
                        Available
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="IN_SHOP" id="status-in-shop" />
                      <Label htmlFor="status-in-shop" className="font-normal cursor-pointer">
                        In Shop
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="OUT_OF_SERVICE" id="status-oos" />
                      <Label htmlFor="status-oos" className="font-normal cursor-pointer">
                        Out of Service
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Assigned Driver</span>
                  <span className="text-foreground">
                    {vehicle.assignedDriver ? vehicle.assignedDriver.name : 'Not assigned'}
                  </span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      vehicle.status === 'AVAILABLE'
                        ? 'default'
                        : vehicle.status === 'OUT_OF_SERVICE'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {vehicle.status?.replace(/_/g, ' ') || 'Unknown'}
                  </Badge>
                </div>
              </div>
            )}
          </SheetSection>

          {/* 3. Vehicle Information */}
          <SheetSection icon={Truck} title="Vehicle Information">
            {isEditing ? (
              <>
                {isTmsSynced && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                    <Lock className="h-3 w-3" />
                    Some fields are managed by your TMS integration
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={isTmsSynced ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-unitNumber">
                      Unit Number * {isTmsSynced && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-unitNumber"
                      value={editForm.unitNumber}
                      onChange={(e) => setEditForm({ ...editForm, unitNumber: e.target.value })}
                      placeholder="e.g. TRUCK-101"
                      required
                      disabled={isTmsSynced}
                    />
                  </div>
                  <div className={isTmsSynced ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-vin">
                      VIN * {isTmsSynced && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-vin"
                      value={editForm.vin}
                      onChange={(e) =>
                        setEditForm({ ...editForm, vin: e.target.value.toUpperCase().replace(/\s/g, '') })
                      }
                      placeholder="17-character VIN"
                      maxLength={17}
                      required
                      disabled={isTmsSynced}
                    />
                    {!isTmsSynced && editForm.vin && editForm.vin.length > 0 && editForm.vin.length !== 17 && (
                      <p className="text-xs text-muted-foreground mt-1">{editForm.vin.length}/17 characters</p>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <Label htmlFor="edit-equipmentType">Equipment Type *</Label>
                  <Select
                    value={editForm.equipmentType}
                    onValueChange={(value) => setEditForm({ ...editForm, equipmentType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select equipment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {equipmentTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-4">
                  <Label htmlFor="edit-ownershipType">Ownership</Label>
                  <Select
                    value={editForm.ownershipType || 'none'}
                    onValueChange={(value) =>
                      setEditForm({ ...editForm, ownershipType: value === 'none' ? undefined : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select ownership type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      <SelectItem value="OWNED">Owned</SelectItem>
                      <SelectItem value="LEASED">Leased</SelectItem>
                      <SelectItem value="OWNER_OPERATOR">Owner-Operator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className={isTmsSynced ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-make">
                      Make {isTmsSynced && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-make"
                      value={editForm.make}
                      onChange={(e) => setEditForm({ ...editForm, make: e.target.value })}
                      placeholder="e.g. Freightliner"
                      disabled={isTmsSynced}
                    />
                  </div>
                  <div className={isTmsSynced ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-model">
                      Model {isTmsSynced && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-model"
                      value={editForm.model}
                      onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                      placeholder="e.g. Cascadia"
                      disabled={isTmsSynced}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className={isTmsSynced ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-year">
                      Year {isTmsSynced && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-year"
                      type="number"
                      min="1990"
                      max={new Date().getFullYear() + 2}
                      value={editForm.year || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, year: e.target.value ? parseInt(e.target.value) : undefined })
                      }
                      placeholder="e.g. 2024"
                      disabled={isTmsSynced}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className={isTmsSynced ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-licensePlate">
                      License Plate {isTmsSynced && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-licensePlate"
                      value={editForm.licensePlate}
                      onChange={(e) => setEditForm({ ...editForm, licensePlate: e.target.value })}
                      placeholder="e.g. ABC-1234"
                      disabled={isTmsSynced}
                    />
                  </div>
                  <div className={isTmsSynced ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-licensePlateState">
                      State {isTmsSynced && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Select
                      value={editForm.licensePlateState}
                      onValueChange={(value) => setEditForm({ ...editForm, licensePlateState: value })}
                      disabled={isTmsSynced}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {usStates.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className="flex items-center space-x-2 pt-6">
                    <Checkbox
                      id="edit-hasSleeperBerth"
                      checked={editForm.hasSleeperBerth ?? true}
                      onCheckedChange={(checked) => setEditForm({ ...editForm, hasSleeperBerth: !!checked })}
                    />
                    <Label htmlFor="edit-hasSleeperBerth" className="font-normal cursor-pointer">
                      Has Sleeper Berth
                    </Label>
                  </div>
                  <div>
                    <Label htmlFor="edit-grossWeightLbs">GVW (lbs)</Label>
                    <Input
                      id="edit-grossWeightLbs"
                      type="number"
                      min="0"
                      max="200000"
                      value={editForm.grossWeightLbs || ''}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          grossWeightLbs: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      placeholder="e.g. 80000"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="VIN" value={vehicle.vin} mono />
                <InfoItem label="Equipment Type" value={equipmentLabel} />
                <InfoItem label="Ownership" value={ownershipLabel} />
                <InfoItem
                  label="Make / Model"
                  value={
                    vehicle.make || vehicle.model
                      ? `${vehicle.make || ''} ${vehicle.model || ''}${vehicle.year ? ` ${vehicle.year}` : ''}`.trim()
                      : undefined
                  }
                />
                <InfoItem
                  label="License Plate"
                  value={
                    vehicle.licensePlate
                      ? `${vehicle.licensePlate}${vehicle.licensePlateState ? ` (${vehicle.licensePlateState})` : ''}`
                      : undefined
                  }
                />
                <InfoItem label="Sleeper Berth" value={vehicle.hasSleeperBerth ? 'Yes' : 'No'} />
                <InfoItem
                  label="Gross Weight"
                  value={vehicle.grossWeightLbs ? `${vehicle.grossWeightLbs.toLocaleString()} lbs` : undefined}
                />
              </div>
            )}
          </SheetSection>

          {/* 4. Capacity & Specs */}
          <SheetSection icon={Fuel} title="Capacity & Specs">
            {isEditing ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-fuelCapacity">Fuel Capacity (gal) *</Label>
                    <Input
                      id="edit-fuelCapacity"
                      type="number"
                      step="1"
                      min="1"
                      max="500"
                      value={editForm.fuelCapacityGallons || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, fuelCapacityGallons: parseFloat(e.target.value) || '' })
                      }
                      placeholder="e.g. 150"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-mpg">MPG</Label>
                    <Input
                      id="edit-mpg"
                      type="number"
                      step="0.1"
                      min="1"
                      max="20"
                      value={editForm.mpg || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, mpg: e.target.value ? parseFloat(e.target.value) : undefined })
                      }
                      placeholder="e.g. 6.5"
                    />
                  </div>
                </div>
                {vehicle.currentFuelGallons != null && (
                  <div className="mt-3">
                    <InfoItem
                      label="Current Fuel"
                      value={`${vehicle.currentFuelGallons} gal${fuelPercent != null ? ` (${fuelPercent}%)` : ''}`}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem
                  label="Fuel Capacity"
                  value={vehicle.fuelCapacityGallons ? `${vehicle.fuelCapacityGallons} gal` : undefined}
                />
                <InfoItem
                  label="Current Fuel"
                  value={
                    vehicle.currentFuelGallons != null
                      ? `${vehicle.currentFuelGallons} gal${fuelPercent != null ? ` (${fuelPercent}%)` : ''}`
                      : undefined
                  }
                />
                <InfoItem label="MPG" value={vehicle.mpg != null ? String(vehicle.mpg) : undefined} />
              </div>
            )}
          </SheetSection>

          {/* 5. Compliance (edit-only) */}
          {isEditing && (
            <SheetSection icon={Shield} title="Compliance">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-reg-expiry">Registration Expiry</Label>
                  <Input
                    id="edit-reg-expiry"
                    type="date"
                    value={editForm.registrationExpiry || ''}
                    onChange={(e) => setEditForm({ ...editForm, registrationExpiry: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-ins-expiry">Insurance Expiry</Label>
                  <Input
                    id="edit-ins-expiry"
                    type="date"
                    value={editForm.insuranceExpiry || ''}
                    onChange={(e) => setEditForm({ ...editForm, insuranceExpiry: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="edit-annual-inspection">Last Annual Inspection</Label>
                  <Input
                    id="edit-annual-inspection"
                    type="date"
                    value={editForm.annualInspectionDate || ''}
                    onChange={(e) => setEditForm({ ...editForm, annualInspectionDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-next-maintenance">Next Maintenance Due</Label>
                  <Input
                    id="edit-next-maintenance"
                    type="date"
                    value={editForm.nextMaintenanceDate || ''}
                    onChange={(e) => setEditForm({ ...editForm, nextMaintenanceDate: e.target.value })}
                  />
                </div>
              </div>
            </SheetSection>
          )}

          {/* 6. Notes */}
          <SheetSection icon={FileText} title="Notes" defaultOpen={false}>
            {isEditing ? (
              <div>
                <Label htmlFor="edit-vehicle-notes" className="sr-only">
                  Notes
                </Label>
                <Textarea
                  id="edit-vehicle-notes"
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Add notes about this vehicle..."
                />
              </div>
            ) : vehicle.notes ? (
              <p className="text-sm text-foreground whitespace-pre-wrap">{vehicle.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes</p>
            )}
          </SheetSection>

          {/* 7. Integration — always view-only */}
          <SheetSection
            icon={ExternalLink}
            title="Integration"
            defaultOpen={false}
            badge={
              !vehicle.externalSource && !hasEldIntegration ? (
                <Badge variant="outline" className="text-xs">
                  Manual Entry
                </Badge>
              ) : undefined
            }
          >
            {vehicle.externalSource || hasEldIntegration ? (
              <>
                {/* TMS sub-section */}
                {vehicle.externalSource && (
                  <div className="space-y-2 mb-4">
                    <h4 className="text-xs font-medium text-foreground">TMS</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem label="Source" value={vehicle.externalSource} />
                      <InfoItem label="External ID" value={vehicle.externalVehicleId} mono />
                      <InfoItem
                        label="Last Synced"
                        value={vehicle.lastSyncedAt ? formatTimestamp(vehicle.lastSyncedAt) : 'Never'}
                      />
                    </div>
                  </div>
                )}

                {/* ELD sub-section */}
                {hasEldIntegration && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-foreground">ELD</h4>
                    {isEldLinked ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">Linked</Badge>
                          <span className="text-sm text-foreground">{eldMeta?.eldId}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <InfoItem label="ELD ID" value={eldMeta?.eldId} mono />
                          <InfoItem label="Vendor" value={eldMeta?.eldVendor} />
                          <InfoItem
                            label="Last Synced"
                            value={eldMeta?.lastSyncAt ? new Date(eldMeta.lastSyncAt).toLocaleString() : undefined}
                          />
                        </div>
                        <Button variant="outline" size="sm" onClick={handleUnlinkEld} loading={unlinkVehicle.isPending}>
                          <Unlink className="h-3.5 w-3.5 mr-1.5" />
                          Unlink
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div
                          className={`flex items-start gap-2 p-3 rounded-md ${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.border}`}
                        >
                          <Link2Off className={`h-4 w-4 ${SEMANTIC_COLORS.caution.text} mt-0.5 shrink-0`} />
                          <p className="text-sm text-muted-foreground">
                            Not linked to ELD. GPS/telematics will not sync for this vehicle until linked.
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleLinkEld} loading={linkVehicle.isPending}>
                          <Link2 className="h-3.5 w-3.5 mr-1.5" />
                          Link to ELD
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not connected to any integration.</p>
            )}
          </SheetSection>

          {/* 8. Documents — always view-only */}
          {vehicleEntityId != null && (
            <SheetSection icon={Paperclip} title="Documents" defaultOpen={false}>
              <CollapsibleDocumentsSection entityType="vehicle" entityId={vehicleEntityId} />
            </SheetSection>
          )}

          {/* 9. Custom Fields */}
          <CustomFieldsSection
            entityType="VEHICLE"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            values={(isEditing ? editForm.customFieldValues : (vehicle as any).customFieldValues) ?? {}}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onChange={(values) => setEditForm((prev: any) => ({ ...prev, customFieldValues: values }))}
            mode={isEditing ? 'edit' : 'view'}
          />
        </div>
      </FormSheet>

      {/* ELD Link Dialog */}
      <EldLinkDialog
        open={eldLinkDialogOpen}
        onOpenChange={setEldLinkDialogOpen}
        entityType="vehicle"
        candidates={eldCandidates}
        onLink={handleManualLink}
        isLinking={linkVehicle.isPending}
      />

      {/* Lifecycle Dialogs */}
      <DeactivationDialog
        open={deactivateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateOpen(false);
            setBlockers(null);
          }
        }}
        entityType="vehicle"
        entityName={vehicle.unitNumber}
        onConfirm={handleDeactivate}
        blockers={blockers}
      />
      <ReactivationDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        entityName={vehicle.unitNumber}
        onConfirm={handleReactivate}
        deactivatedAt={vehicle.deactivatedAt}
        deactivationReason={vehicle.deactivationReason}
      />
      <DecommissionDialog
        open={decommissionOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDecommissionOpen(false);
            setDecommissionBlockers(null);
          }
        }}
        entityName={vehicle.unitNumber}
        onConfirm={handleDecommission}
        blockers={decommissionBlockers}
      />
    </>
  );
}
