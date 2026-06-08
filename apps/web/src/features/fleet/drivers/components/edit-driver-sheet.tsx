// DEPRECATED: This file is no longer used. Inline editing is now in driver-detail-sheet.tsx
'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetKeyboardHint } from '@sally/ui/components/ui/form-sheet';
import { SheetSection } from '@sally/ui/components/ui/sheet-section';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Badge } from '@sally/ui/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import {
  Lock,
  Clock,
  Truck,
  User,
  Shield,
  DollarSign,
  FileText,
  ExternalLink,
  Package,
  MapPin,
  Pencil,
} from 'lucide-react';
import { PhoneInput } from '@sally/ui/components/ui/phone-input';
import { useUpdateDriver, useDriverHOS } from '../hooks/use-drivers';
import type { Driver, UpdateDriverRequest } from '../types';
import { useReferenceData } from '@/features/platform/reference-data';
import { listVehicles, type Vehicle } from '@/features/fleet/vehicles';
import { usePayStructure } from '@/features/financials/pay/hooks/use-pay-structure';
import { PayStructureSheet } from '@/features/financials/pay/components/pay-structure-sheet';
import { useIntegrations } from '@/features/integrations/hooks/use-integrations';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';

interface EditDriverSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver;
  externalSource?: string;
}

export default function EditDriverSheet({ open, onOpenChange, driver, externalSource }: EditDriverSheetProps) {
  const updateDriver = useUpdateDriver();
  const { data: refData } = useReferenceData(['cdl_class', 'us_state', 'endorsement']);
  const cdlClasses = refData?.cdl_class ?? [];
  const usStates = refData?.us_state ?? [];
  const endorsementOptions = refData?.endorsement ?? [];
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const { data: _hos } = useDriverHOS(driver?.driverId ?? '');
  const { data: payStructure } = usePayStructure(driver?.driverId ?? '');
  const { data: integrations } = useIntegrations();
  const { formatCalendarDate, formatTimestamp } = useFormatters();
  const [payStructureOpen, setPayStructureOpen] = useState(false);

  const hasEldIntegration =
    integrations?.some(
      (i) => i.integrationType === 'ELD' && i.isEnabled && ['ACTIVE', 'CONFIGURED'].includes(i.status),
    ) ?? false;

  const eldMetadata = driver.eldMetadata as {
    eldId?: string;
    username?: string;
    eldVendor?: string;
    lastSyncAt?: string;
  } | null;
  const isEldLinked = !!eldMetadata?.eldId;

  // Fetch vehicles for assignment dropdown
  useEffect(() => {
    listVehicles()
      .then(setVehicles)
      .catch(() => {});
  }, []);

  const [formData, setFormData] = useState<UpdateDriverRequest & { assignedVehicleId?: number | null }>({
    name: driver.name || '',
    phone: driver.phone || '',
    email: driver.email || '',
    cdlClass: (driver.cdlClass as 'A' | 'B' | 'C' | undefined) || undefined,
    licenseNumber: driver.licenseNumber || '',
    licenseState: driver.licenseState || '',
    endorsements: driver.endorsements || [],
    hireDate: driver.hireDate || '',
    medicalCardExpiry: driver.medicalCardExpiry || '',
    homeTerminalCity: driver.homeTerminalCity || '',
    homeTerminalState: driver.homeTerminalState || '',
    emergencyContactName: driver.emergencyContactName || '',
    emergencyContactPhone: driver.emergencyContactPhone || '',
    notes: driver.notes || '',
    assignedVehicleId: driver.assignedVehicleId ?? null,
    cdlExpiry: driver.cdlExpiry ? new Date(driver.cdlExpiry).toISOString().split('T')[0] : '',
    mvrDate: driver.mvrDate ? new Date(driver.mvrDate).toISOString().split('T')[0] : '',
    drugTestDate: driver.drugTestDate ? new Date(driver.drugTestDate).toISOString().split('T')[0] : '',
    annualReviewDate: driver.annualReviewDate ? new Date(driver.annualReviewDate).toISOString().split('T')[0] : '',
  });

  const [error, setError] = useState<string | null>(null);

  // Reset form when driver changes
  useEffect(() => {
    setFormData({
      name: driver.name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      cdlClass: (driver.cdlClass as 'A' | 'B' | 'C' | undefined) || undefined,
      licenseNumber: driver.licenseNumber || '',
      licenseState: driver.licenseState || '',
      endorsements: driver.endorsements || [],
      hireDate: driver.hireDate ? new Date(driver.hireDate).toISOString().split('T')[0] : '',
      medicalCardExpiry: driver.medicalCardExpiry ? new Date(driver.medicalCardExpiry).toISOString().split('T')[0] : '',
      homeTerminalCity: driver.homeTerminalCity || '',
      homeTerminalState: driver.homeTerminalState || '',
      emergencyContactName: driver.emergencyContactName || '',
      emergencyContactPhone: driver.emergencyContactPhone || '',
      notes: driver.notes || '',
      assignedVehicleId: driver.assignedVehicleId ?? null,
      cdlExpiry: driver.cdlExpiry ? new Date(driver.cdlExpiry).toISOString().split('T')[0] : '',
      mvrDate: driver.mvrDate ? new Date(driver.mvrDate).toISOString().split('T')[0] : '',
      drugTestDate: driver.drugTestDate ? new Date(driver.drugTestDate).toISOString().split('T')[0] : '',
      annualReviewDate: driver.annualReviewDate ? new Date(driver.annualReviewDate).toISOString().split('T')[0] : '',
    });
    setError(null);
  }, [driver, open]);

  const handleEndorsementToggle = (value: string) => {
    const current = formData.endorsements || [];
    if (current.includes(value)) {
      setFormData({ ...formData, endorsements: current.filter((e) => e !== value) });
    } else {
      setFormData({ ...formData, endorsements: [...current, value] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const payload = {
        ...formData,
        phone: formData.phone?.trim() || undefined,
        email: formData.email?.trim() || undefined,
        licenseState: formData.licenseState?.trim() || undefined,
        hireDate: formData.hireDate?.trim() || undefined,
        medicalCardExpiry: formData.medicalCardExpiry?.trim() || undefined,
        homeTerminalCity: formData.homeTerminalCity?.trim() || undefined,
        homeTerminalState: formData.homeTerminalState?.trim() || undefined,
        emergencyContactName: formData.emergencyContactName?.trim() || undefined,
        emergencyContactPhone: formData.emergencyContactPhone?.trim() || undefined,
        notes: formData.notes?.trim() || undefined,
        endorsements: formData.endorsements?.length ? formData.endorsements : undefined,
        assignedVehicleId: formData.assignedVehicleId,
        cdlExpiry: formData.cdlExpiry?.trim() ? new Date(formData.cdlExpiry).toISOString() : undefined,
        mvrDate: formData.mvrDate?.trim() ? new Date(formData.mvrDate).toISOString() : undefined,
        drugTestDate: formData.drugTestDate?.trim() ? new Date(formData.drugTestDate).toISOString() : undefined,
        annualReviewDate: formData.annualReviewDate?.trim()
          ? new Date(formData.annualReviewDate).toISOString()
          : undefined,
      };
      await updateDriver.mutateAsync({
        driverId: driver.driverId,
        data: payload,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update driver');
    }
  };

  // HOS calculations
  const driveRemaining = driver.currentHos?.driveRemaining ?? 11 - (driver.currentHoursDriven ?? 0);
  const shiftRemaining = driver.currentHos?.shiftRemaining ?? 14 - (driver.currentOnDutyTime ?? 0);
  const cycleRemaining = driver.currentHos?.cycleRemaining ?? 70 - (driver.cycleHoursUsed ?? 0);

  const payTypeLabel: Record<string, string> = {
    PER_MILE: 'Per Mile',
    PERCENTAGE: 'Percentage',
    FLAT_RATE: 'Flat Rate',
    HYBRID: 'Hybrid',
  };

  const formatPayRate = () => {
    if (!payStructure) return null;
    switch (payStructure.type) {
      case 'PER_MILE':
        return `$${((payStructure.ratePerMileCents ?? 0) / 100).toFixed(2)}/mi`;
      case 'PERCENTAGE':
        return `${payStructure.percentage ?? 0}%`;
      case 'FLAT_RATE':
        return `$${((payStructure.flatRateCents ?? 0) / 100).toFixed(2)}/load`;
      case 'HYBRID':
        return `$${((payStructure.hybridBaseCents ?? 0) / 100).toFixed(2)} + ${payStructure.hybridPercent ?? 0}%`;
      default:
        return null;
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-6 overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          pinnable
          resizable
          defaultPinned
        >
          <SheetHeader>
            <SheetTitle>Edit Driver</SheetTitle>
          </SheetHeader>
          <SheetKeyboardHint />

          <div className="mt-6">
            <form id="edit-driver-form" onSubmit={handleSubmit} className="space-y-5 pb-4">
              {externalSource && (
                <Alert className="bg-info/10 border-info/20">
                  <AlertDescription className="text-sm text-foreground">
                    <Lock className="h-3 w-3 inline mr-1" />
                    Some fields are managed by <span className="font-medium">{externalSource}</span> and cannot be
                    edited here.
                  </AlertDescription>
                </Alert>
              )}

              {/* 1. HOS Status (read-only) */}
              <SheetSection icon={Clock} title="HOS Status" collapsible={false}>
                {driver.hosDataSource || driver.currentHos ? (
                  <div className="space-y-2">
                    {[
                      { label: 'Drive', remaining: driveRemaining, max: 11 },
                      { label: 'Shift', remaining: shiftRemaining, max: 14 },
                      { label: 'Cycle', remaining: cycleRemaining, max: 70 },
                      { label: 'Break', remaining: 8 - (driver.currentHoursSinceBreak ?? 0), max: 8 },
                    ].map(({ label, remaining, max }) => {
                      const barPct = Math.max(0, Math.min(100, (remaining / max) * 100));
                      const color = barPct < 10 ? 'bg-critical' : barPct < 25 ? 'bg-caution' : 'bg-muted-foreground';
                      const hours = Math.floor(remaining);
                      const mins = Math.round((remaining - hours) * 60);
                      return (
                        <div key={label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="text-foreground">
                              {hours}h {mins}m
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${color}`}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground">
                      via {driver.hosDataSource || 'cache'}
                      {driver.hosDataSyncedAt ? ` · synced ${formatTimestamp(driver.hosDataSyncedAt)}` : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No HOS data available</p>
                )}
              </SheetSection>

              {/* 2. Operations */}
              <SheetSection icon={Truck} title="Operations">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Primary Vehicle */}
                  <div>
                    <Label>Primary Vehicle</Label>
                    <Select
                      value={formData.assignedVehicleId?.toString() || 'none'}
                      onValueChange={(val) =>
                        setFormData({ ...formData, assignedVehicleId: val === 'none' ? null : parseInt(val) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vehicle..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            {v.unitNumber}
                            {v.make && v.model ? ` — ${v.make} ${v.model}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Current Load (read-only) */}
                  <div>
                    <span className="text-xs text-muted-foreground">Current Load</span>
                    {driver.currentLoad ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <Package className="h-3 w-3" />
                        <span className="text-sm text-foreground">{driver.currentLoad.referenceNumber}</span>
                        <Badge variant="outline">{driver.currentLoad.status}</Badge>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1.5">&mdash;</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-city">Home Terminal City</Label>
                    <Input
                      id="edit-city"
                      value={formData.homeTerminalCity}
                      onChange={(e) => setFormData({ ...formData, homeTerminalCity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-terminal-state">Home Terminal State</Label>
                    <Select
                      value={formData.homeTerminalState || ''}
                      onValueChange={(value) => setFormData({ ...formData, homeTerminalState: value })}
                    >
                      <SelectTrigger id="edit-terminal-state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {usStates.map((state) => (
                          <SelectItem key={state.code} value={state.code}>
                            {state.label} ({state.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-3">
                  <InfoItem
                    label="Timezone"
                    value={driver.homeTerminalTimezone}
                    icon={<MapPin className="h-3 w-3" />}
                  />
                </div>
              </SheetSection>

              {/* 3. Personal Information */}
              <SheetSection icon={User} title="Personal Information">
                {/* Name */}
                <div className={`mb-4 ${externalSource ? 'opacity-60' : ''}`}>
                  <Label htmlFor="edit-name">
                    Name {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                  </Label>
                  <Input
                    id="edit-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!!externalSource}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={externalSource ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-phone">
                      Phone {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <PhoneInput
                      id="edit-phone"
                      value={formData.phone ?? ''}
                      onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                      disabled={!!externalSource}
                    />
                  </div>
                  <div className={externalSource ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-email">
                      Email {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={!!externalSource}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-ec-name">Emergency Contact Name</Label>
                    <Input
                      id="edit-ec-name"
                      value={formData.emergencyContactName}
                      onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-ec-phone">Emergency Contact Phone</Label>
                    <PhoneInput
                      id="edit-ec-phone"
                      value={formData.emergencyContactPhone ?? ''}
                      onChange={(e164) => setFormData({ ...formData, emergencyContactPhone: e164 })}
                    />
                  </div>
                </div>
              </SheetSection>

              {/* 4. Compliance & License */}
              <SheetSection icon={Shield} title="Compliance & License">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={externalSource ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-cdl">
                      CDL Class {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Select
                      value={formData.cdlClass || ''}
                      onValueChange={(value) => setFormData({ ...formData, cdlClass: value as 'A' | 'B' | 'C' })}
                      disabled={!!externalSource}
                    >
                      <SelectTrigger id="edit-cdl">
                        <SelectValue placeholder="Select CDL class" />
                      </SelectTrigger>
                      <SelectContent>
                        {cdlClasses.map((cdl) => (
                          <SelectItem key={cdl.code} value={cdl.code}>
                            {cdl.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={externalSource ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-license">
                      License Number {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Input
                      id="edit-license"
                      value={formData.licenseNumber}
                      onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                      disabled={!!externalSource}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div className={externalSource ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-license-state">
                      License State {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Select
                      value={formData.licenseState || ''}
                      onValueChange={(value) => setFormData({ ...formData, licenseState: value })}
                      disabled={!!externalSource}
                    >
                      <SelectTrigger id="edit-license-state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {usStates.map((state) => (
                          <SelectItem key={state.code} value={state.code}>
                            {state.label} ({state.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4">
                  <Label>Endorsements</Label>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {endorsementOptions.map((opt) => (
                      <div key={opt.code} className="flex items-center gap-2">
                        <Checkbox
                          id={`endorsement-${opt.code}`}
                          checked={(formData.endorsements || []).includes(opt.code)}
                          onCheckedChange={() => handleEndorsementToggle(opt.code)}
                        />
                        <Label htmlFor={`endorsement-${opt.code}`} className="text-sm font-normal cursor-pointer">
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-hire-date">Hire Date</Label>
                    <Input
                      id="edit-hire-date"
                      type="date"
                      value={formData.hireDate || ''}
                      onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-medical">Medical Card Expiry</Label>
                    <Input
                      id="edit-medical"
                      type="date"
                      value={formData.medicalCardExpiry || ''}
                      onChange={(e) => setFormData({ ...formData, medicalCardExpiry: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-cdl-expiry">CDL Expiry</Label>
                    <Input
                      id="edit-cdl-expiry"
                      type="date"
                      value={formData.cdlExpiry || ''}
                      onChange={(e) => setFormData({ ...formData, cdlExpiry: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-mvr-date">Last MVR Date</Label>
                    <Input
                      id="edit-mvr-date"
                      type="date"
                      value={formData.mvrDate || ''}
                      onChange={(e) => setFormData({ ...formData, mvrDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-drug-test">Last Drug Test</Label>
                    <Input
                      id="edit-drug-test"
                      type="date"
                      value={formData.drugTestDate || ''}
                      onChange={(e) => setFormData({ ...formData, drugTestDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-annual-review">Last Annual Review</Label>
                    <Input
                      id="edit-annual-review"
                      type="date"
                      value={formData.annualReviewDate || ''}
                      onChange={(e) => setFormData({ ...formData, annualReviewDate: e.target.value })}
                    />
                  </div>
                </div>
              </SheetSection>

              {/* 5. Pay Structure (read-only) */}
              <SheetSection icon={DollarSign} title="Pay Structure">
                {payStructure ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{payTypeLabel[payStructure.type] ?? payStructure.type}</Badge>
                        <span className="text-sm font-medium text-foreground">{formatPayRate()}</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPayStructureOpen(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Effective {formatCalendarDate(payStructure.effectiveDate, DISPLAY_FORMATS.FRIENDLY)}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Not configured</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPayStructureOpen(true)}>
                      Configure
                    </Button>
                  </div>
                )}
              </SheetSection>

              {/* 6. Notes */}
              <SheetSection icon={FileText} title="Notes" defaultOpen={false}>
                <div>
                  <Label htmlFor="edit-notes" className="sr-only">
                    Notes
                  </Label>
                  <Textarea
                    id="edit-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder="Add notes about this driver..."
                  />
                </div>
              </SheetSection>

              {/* 7. Integration (read-only) */}
              <SheetSection
                icon={ExternalLink}
                title="Integration"
                defaultOpen={false}
                badge={
                  !driver.externalSource && !hasEldIntegration ? (
                    <Badge variant="outline" className="text-xs">
                      Manual Entry
                    </Badge>
                  ) : undefined
                }
              >
                {driver.externalSource || hasEldIntegration ? (
                  <>
                    {driver.externalSource && (
                      <div className="space-y-2 mb-4">
                        <h4 className="text-xs font-medium text-foreground">TMS</h4>
                        <div className="grid grid-cols-2 gap-3">
                          <InfoItem label="Source" value={driver.externalSource} />
                          <InfoItem label="External ID" value={driver.externalDriverId} mono />
                          <div>
                            <span className="text-xs text-muted-foreground">Sync Status</span>
                            <div className="mt-0.5">
                              <Badge variant="outline">{driver.syncStatus || 'MANUAL_ENTRY'}</Badge>
                            </div>
                          </div>
                          <InfoItem
                            label="Last Synced"
                            value={driver.lastSyncedAt ? formatTimestamp(driver.lastSyncedAt) : 'Never'}
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
                            <InfoItem label="ELD ID" value={eldMetadata?.eldId} mono />
                            <InfoItem label="Vendor" value={eldMetadata?.eldVendor} />
                            <InfoItem
                              label="Last Synced"
                              value={
                                eldMetadata?.lastSyncAt ? new Date(eldMetadata.lastSyncAt).toLocaleString() : undefined
                              }
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Not linked to ELD</p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Not connected to any integration.</p>
                )}
              </SheetSection>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {error.includes(',') ? (
                      <ul className="list-disc list-inside space-y-1">
                        {error.split(',').map((msg, i) => (
                          <li key={i}>{msg.trim()}</li>
                        ))}
                      </ul>
                    ) : (
                      error
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </div>

          <div className="flex items-center gap-2 pt-6">
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-driver-form" loading={updateDriver.isPending}>
              Save Changes
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Pay Structure Sheet */}
      <PayStructureSheet
        driverId={driver.driverId}
        driverName={driver.name}
        open={payStructureOpen}
        onOpenChange={setPayStructureOpen}
      />
    </>
  );
}
