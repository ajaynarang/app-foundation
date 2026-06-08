'use client';

import { useState, useEffect } from 'react';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';

import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Badge } from '@sally/ui/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@sally/ui/components/ui/radio-group';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { Lock, Truck, Activity, Satellite, Shield, Fuel, FileText, ExternalLink } from 'lucide-react';
import { createVehicle, updateVehicle } from '../api';
import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import { listDrivers, type Driver } from '@/features/fleet/drivers';
import { useIntegrations } from '@/features/integrations/hooks/use-integrations';
import { useReferenceData } from '@/features/platform/reference-data';
import type { Vehicle, UpdateVehicleRequest } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { timeAgo } from '@/shared/lib/date-utils';

interface EditVehicleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: Vehicle | null; // null = create mode
  onSuccess: () => void;
}

export default function EditVehicleSheet({ open, onOpenChange, vehicle, onSuccess }: EditVehicleSheetProps) {
  const isTmsSynced = !!vehicle?.externalSource;
  const { data: refData } = useReferenceData(['equipment_type', 'us_state']);
  const { data: integrations } = useIntegrations();
  const hasEldIntegration =
    integrations?.some(
      (i) => i.integrationType === 'ELD' && i.isEnabled && ['ACTIVE', 'CONFIGURED'].includes(i.status),
    ) ?? false;

  const eldMeta = vehicle?.eldTelematicsMetadata as { eldId?: string; eldVendor?: string; lastSyncAt?: string } | null;
  const isEldLinked = !!eldMeta?.eldId;

  const [formData, setFormData] = useState<
    UpdateVehicleRequest & {
      assignedDriverId?: number | null;
      customFieldValues?: Record<string, string | number | null>;
    }
  >({
    unitNumber: vehicle?.unitNumber || '',
    vin: vehicle?.vin || '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    equipmentType: vehicle?.equipmentType || (undefined as any),
    ownershipType: vehicle?.ownershipType || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fuelCapacityGallons: vehicle?.fuelCapacityGallons || ('' as any),
    mpg: vehicle?.mpg || undefined,
    status: vehicle?.status || 'AVAILABLE',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year || undefined,
    licensePlate: vehicle?.licensePlate || '',
    licensePlateState: vehicle?.licensePlateState || '',
    hasSleeperBerth: vehicle?.hasSleeperBerth ?? true,
    grossWeightLbs: vehicle?.grossWeightLbs || undefined,
    assignedDriverId: vehicle?.assignedDriverId ?? null,
    notes: vehicle?.notes || '',
    registrationExpiry: vehicle?.registrationExpiry
      ? new Date(vehicle.registrationExpiry).toISOString().split('T')[0]
      : '',
    insuranceExpiry: vehicle?.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toISOString().split('T')[0] : '',
    annualInspectionDate: vehicle?.annualInspectionDate
      ? new Date(vehicle.annualInspectionDate).toISOString().split('T')[0]
      : '',
    nextMaintenanceDate: vehicle?.nextMaintenanceDate
      ? new Date(vehicle.nextMaintenanceDate).toISOString().split('T')[0]
      : '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    customFieldValues: ((vehicle as any)?.customFieldValues ?? {}) as Record<string, string | number | null>,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  // Reset form when vehicle/open changes
  useEffect(() => {
    setFormData({
      unitNumber: vehicle?.unitNumber || '',
      vin: vehicle?.vin || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      equipmentType: vehicle?.equipmentType || (undefined as any),
      ownershipType: vehicle?.ownershipType || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fuelCapacityGallons: vehicle?.fuelCapacityGallons || ('' as any),
      mpg: vehicle?.mpg || undefined,
      status: vehicle?.status || 'AVAILABLE',
      make: vehicle?.make || '',
      model: vehicle?.model || '',
      year: vehicle?.year || undefined,
      licensePlate: vehicle?.licensePlate || '',
      licensePlateState: vehicle?.licensePlateState || '',
      hasSleeperBerth: vehicle?.hasSleeperBerth ?? true,
      grossWeightLbs: vehicle?.grossWeightLbs || undefined,
      assignedDriverId: vehicle?.assignedDriverId ?? null,
      notes: vehicle?.notes || '',
      registrationExpiry: vehicle?.registrationExpiry
        ? new Date(vehicle.registrationExpiry).toISOString().split('T')[0]
        : '',
      insuranceExpiry: vehicle?.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toISOString().split('T')[0] : '',
      annualInspectionDate: vehicle?.annualInspectionDate
        ? new Date(vehicle.annualInspectionDate).toISOString().split('T')[0]
        : '',
      nextMaintenanceDate: vehicle?.nextMaintenanceDate
        ? new Date(vehicle.nextMaintenanceDate).toISOString().split('T')[0]
        : '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customFieldValues: ((vehicle as any)?.customFieldValues ?? {}) as Record<string, string | number | null>,
    });
    setError(null);
  }, [vehicle, open]);

  // Fetch drivers for assignment dropdown
  useEffect(() => {
    listDrivers()
      .then(setDrivers)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // VIN validation — only for manual vehicles
    if (!isTmsSynced) {
      const cleanVin = formData.vin?.toUpperCase().replace(/\s/g, '') || '';
      if (cleanVin.length !== 17) {
        setError('VIN must be exactly 17 characters');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const complianceDates = {
        registrationExpiry: formData.registrationExpiry?.trim()
          ? new Date(formData.registrationExpiry).toISOString()
          : undefined,
        insuranceExpiry: formData.insuranceExpiry?.trim()
          ? new Date(formData.insuranceExpiry).toISOString()
          : undefined,
        annualInspectionDate: formData.annualInspectionDate?.trim()
          ? new Date(formData.annualInspectionDate).toISOString()
          : undefined,
        nextMaintenanceDate: formData.nextMaintenanceDate?.trim()
          ? new Date(formData.nextMaintenanceDate).toISOString()
          : undefined,
      };

      if (vehicle) {
        if (isTmsSynced) {
          await updateVehicle(vehicle.vehicleId, {
            equipmentType: formData.equipmentType,
            ownershipType: formData.ownershipType,
            fuelCapacityGallons: formData.fuelCapacityGallons,
            mpg: formData.mpg,
            status: formData.status,
            hasSleeperBerth: formData.hasSleeperBerth,
            grossWeightLbs: formData.grossWeightLbs,
            assignedDriverId: formData.assignedDriverId,
            notes: formData.notes?.trim() || undefined,
            ...(formData.customFieldValues !== undefined && { customFieldValues: formData.customFieldValues }),
            ...complianceDates,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        } else {
          await updateVehicle(vehicle.vehicleId, {
            ...formData,
            vin: formData.vin?.toUpperCase().replace(/\s/g, ''),
            make: formData.make || undefined,
            model: formData.model || undefined,
            licensePlate: formData.licensePlate || undefined,
            licensePlateState: formData.licensePlateState || undefined,
            assignedDriverId: formData.assignedDriverId,
            notes: formData.notes?.trim() || undefined,
            ...complianceDates,
          });
        }
      } else {
        await createVehicle({
          unitNumber: formData.unitNumber!,
          vin: formData.vin?.toUpperCase().replace(/\s/g, '') || '',
          equipmentType: formData.equipmentType!,
          ownershipType: formData.ownershipType,
          fuelCapacityGallons: formData.fuelCapacityGallons!,
          mpg: formData.mpg,
          status: (formData.status as 'AVAILABLE' | 'IN_SHOP' | 'OUT_OF_SERVICE' | undefined) || 'AVAILABLE',
          make: formData.make || undefined,
          model: formData.model || undefined,
          year: formData.year,
          licensePlate: formData.licensePlate || undefined,
          licensePlateState: formData.licensePlateState || undefined,
          hasSleeperBerth: formData.hasSleeperBerth,
          grossWeightLbs: formData.grossWeightLbs,
          currentFuelGallons: formData.currentFuelGallons,
          assignedDriverId: formData.assignedDriverId,
          notes: formData.notes?.trim() || undefined,
          ...complianceDates,
        });
      }
      showSuccess(vehicle ? 'Vehicle updated successfully' : 'Vehicle created successfully');
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save vehicle';
      showError(vehicle ? 'Failed to update vehicle' : 'Failed to create vehicle', message);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const fuelPercent =
    vehicle?.fuelCapacityGallons && vehicle?.currentFuelGallons
      ? Math.round((vehicle.currentFuelGallons / vehicle.fuelCapacityGallons) * 100)
      : null;

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={vehicle ? 'Edit Truck' : 'Add Truck'}
      mode="edit"
      onSubmit={() => handleSubmit()}
      submitLabel={vehicle ? 'Update' : 'Create'}
      isSubmitting={isSubmitting}
      entityType="vehicle"
      headerActions={
        isTmsSynced ? (
          <Badge variant="muted" className="text-xs font-normal gap-1">
            <Lock className="h-3 w-3" />
            Synced from {vehicle!.externalSource}
          </Badge>
        ) : undefined
      }
    >
      <div>
        <form id="edit-vehicle-form" onSubmit={handleSubmit} className="space-y-5 pb-4">
          {/* 1. Telematics (read-only, edit mode only) */}
          {vehicle && vehicle.telematics && (
            <SheetSection icon={Satellite} title="Telematics" collapsible={false}>
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
                {vehicle.telematics.fuelLevel != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fuel Level</span>
                    <span className="text-foreground">{vehicle.telematics.fuelLevel.toFixed(0)}%</span>
                  </div>
                )}
                {vehicle.telematics.timestamp && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Updated</span>
                    <span className="text-muted-foreground text-xs">{timeAgo(vehicle.telematics.timestamp)}</span>
                  </div>
                )}
              </div>
            </SheetSection>
          )}

          {/* 2. Operations */}
          <SheetSection icon={Activity} title="Operations">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Primary Driver</Label>
                <Select
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  value={(formData as any).assignedDriverId?.toString() || 'none'}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onValueChange={(val) =>
                    setFormData({ ...formData, assignedDriverId: val === 'none' ? null : parseInt(val) } as any)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {drivers.map((d: any) => (
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
                value={formData.status || 'AVAILABLE'}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onValueChange={(value) => setFormData({ ...formData, status: value as any })}
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
          </SheetSection>

          {/* 3. Vehicle Information */}
          <SheetSection icon={Truck} title="Vehicle Information">
            {isTmsSynced && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                <Lock className="h-3 w-3" />
                Some fields are managed by your TMS integration
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="unitNumber">Unit Number *</Label>
                <Input
                  id="unitNumber"
                  value={formData.unitNumber}
                  onChange={(e) => setFormData({ ...formData, unitNumber: e.target.value })}
                  placeholder="e.g. TRUCK-101"
                  required
                  disabled={isTmsSynced}
                />
              </div>
              <div>
                <Label htmlFor="vin">VIN *</Label>
                <Input
                  id="vin"
                  value={formData.vin}
                  onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase().replace(/\s/g, '') })}
                  placeholder="17-character VIN"
                  maxLength={17}
                  required
                  disabled={isTmsSynced}
                />
                {!isTmsSynced && formData.vin && formData.vin.length > 0 && formData.vin.length !== 17 && (
                  <p className="text-xs text-muted-foreground mt-1">{formData.vin.length}/17 characters</p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <Label htmlFor="equipmentType">Equipment Type *</Label>
              <Select
                value={formData.equipmentType}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onValueChange={(value) => setFormData({ ...formData, equipmentType: value as any })}
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
              <Label htmlFor="ownershipType">Ownership</Label>
              <Select
                value={formData.ownershipType || 'none'}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onValueChange={(value) =>
                  setFormData({ ...formData, ownershipType: value === 'none' ? undefined : (value as any) })
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
              <div>
                <Label htmlFor="make">Make</Label>
                <Input
                  id="make"
                  value={formData.make}
                  onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                  placeholder="e.g. Freightliner"
                  disabled={isTmsSynced}
                />
              </div>
              <div>
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="e.g. Cascadia"
                  disabled={isTmsSynced}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  min="1990"
                  max={new Date().getFullYear() + 2}
                  value={formData.year || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  placeholder="e.g. 2024"
                  disabled={isTmsSynced}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label htmlFor="licensePlate">License Plate</Label>
                <Input
                  id="licensePlate"
                  value={formData.licensePlate}
                  onChange={(e) => setFormData({ ...formData, licensePlate: e.target.value })}
                  placeholder="e.g. ABC-1234"
                  disabled={isTmsSynced}
                />
              </div>
              <div>
                <Label htmlFor="licensePlateState">State</Label>
                <Select
                  value={formData.licensePlateState}
                  onValueChange={(value) => setFormData({ ...formData, licensePlateState: value })}
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
                  id="hasSleeperBerth"
                  checked={formData.hasSleeperBerth ?? true}
                  onCheckedChange={(checked) => setFormData({ ...formData, hasSleeperBerth: !!checked })}
                />
                <Label htmlFor="hasSleeperBerth" className="font-normal cursor-pointer">
                  Has Sleeper Berth
                </Label>
              </div>
              <div>
                <Label htmlFor="grossWeightLbs">GVW (lbs)</Label>
                <Input
                  id="grossWeightLbs"
                  type="number"
                  min="0"
                  max="200000"
                  value={formData.grossWeightLbs || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, grossWeightLbs: e.target.value ? parseInt(e.target.value) : undefined })
                  }
                  placeholder="e.g. 80000"
                />
              </div>
            </div>
          </SheetSection>

          {/* 4. Fuel & Specs */}
          <SheetSection icon={Fuel} title="Fuel & Specs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fuel_capacity">Fuel Capacity (gal) *</Label>
                <Input
                  id="fuel_capacity"
                  type="number"
                  step="1"
                  min="1"
                  max="500"
                  value={formData.fuelCapacityGallons || ''}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(e) =>
                    setFormData({ ...formData, fuelCapacityGallons: parseFloat(e.target.value) || ('' as any) })
                  }
                  placeholder="e.g. 150"
                  required
                />
              </div>
              <div>
                <Label htmlFor="mpg">MPG</Label>
                <Input
                  id="mpg"
                  type="number"
                  step="0.1"
                  min="1"
                  max="20"
                  value={formData.mpg || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, mpg: e.target.value ? parseFloat(e.target.value) : undefined })
                  }
                  placeholder="e.g. 6.5"
                />
              </div>
            </div>
            {vehicle && vehicle.currentFuelGallons != null && (
              <div className="mt-3">
                <InfoItem
                  label="Current Fuel"
                  value={`${vehicle.currentFuelGallons} gal${fuelPercent != null ? ` (${fuelPercent}%)` : ''}`}
                />
              </div>
            )}
          </SheetSection>

          {/* 5. Compliance */}
          <SheetSection icon={Shield} title="Compliance">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-reg-expiry">Registration Expiry</Label>
                <Input
                  id="edit-reg-expiry"
                  type="date"
                  value={formData.registrationExpiry || ''}
                  onChange={(e) => setFormData({ ...formData, registrationExpiry: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-ins-expiry">Insurance Expiry</Label>
                <Input
                  id="edit-ins-expiry"
                  type="date"
                  value={formData.insuranceExpiry || ''}
                  onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <Label htmlFor="edit-annual-inspection">Last Annual Inspection</Label>
                <Input
                  id="edit-annual-inspection"
                  type="date"
                  value={formData.annualInspectionDate || ''}
                  onChange={(e) => setFormData({ ...formData, annualInspectionDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-next-maintenance">Next Maintenance Due</Label>
                <Input
                  id="edit-next-maintenance"
                  type="date"
                  value={formData.nextMaintenanceDate || ''}
                  onChange={(e) => setFormData({ ...formData, nextMaintenanceDate: e.target.value })}
                />
              </div>
            </div>
          </SheetSection>

          {/* 6. Notes */}
          <SheetSection icon={FileText} title="Notes" defaultOpen={!!formData.notes}>
            <div>
              <Label htmlFor="vehicle-notes" className="sr-only">
                Notes
              </Label>
              <Textarea
                id="vehicle-notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder="Add notes about this vehicle..."
              />
            </div>
          </SheetSection>

          {/* 7. Integration (read-only, edit mode only) */}
          {vehicle && (vehicle.externalSource || hasEldIntegration) && (
            <SheetSection icon={ExternalLink} title="Integration" defaultOpen={false}>
              {vehicle.externalSource && (
                <div className="space-y-2 mb-4">
                  <h4 className="text-xs font-medium text-foreground">TMS</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoItem label="Source" value={vehicle.externalSource} />
                    <InfoItem label="External ID" value={vehicle.externalVehicleId} mono />
                    <InfoItem
                      label="Last Synced"
                      value={vehicle.lastSyncedAt ? new Date(vehicle.lastSyncedAt).toLocaleString() : 'Never'}
                    />
                  </div>
                </div>
              )}
              {hasEldIntegration && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-foreground">ELD</h4>
                  {isEldLinked ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs text-muted-foreground">Status</span>
                        <div className="mt-0.5">
                          <Badge variant="default">Linked</Badge>
                        </div>
                      </div>
                      <InfoItem label="ELD ID" value={eldMeta?.eldId} mono />
                      <InfoItem label="Vendor" value={eldMeta?.eldVendor} />
                      <InfoItem
                        label="Last Synced"
                        value={eldMeta?.lastSyncAt ? new Date(eldMeta.lastSyncAt).toLocaleString() : undefined}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not linked to ELD</p>
                  )}
                </div>
              )}
            </SheetSection>
          )}

          {/* Custom Fields */}
          <CustomFieldsSection
            entityType="VEHICLE"
            values={formData.customFieldValues ?? {}}
            onChange={(values) => setFormData((prev) => ({ ...prev, customFieldValues: values }))}
            mode="edit"
          />

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </form>
      </div>
    </FormSheet>
  );
}
