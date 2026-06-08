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
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { PhoneInput } from '@sally/ui/components/ui/phone-input';
import { CollapsibleDocumentsSection } from '@/features/fleet/documents';
import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import { PayStructureSheet } from '@/features/financials/pay/components/pay-structure-sheet';
import { usePayStructure } from '@/features/financials/pay/hooks/use-pay-structure';
import { useDriverHOS, useUpdateDriver } from '../hooks/use-drivers';
import { listVehicles, type Vehicle } from '@/features/fleet/vehicles';
import type { UpdateDriverRequest } from '../types';
import { useReferenceData } from '@/features/platform/reference-data';
import { getSourceLabel, driversApi } from '../index';
import type { Driver } from '../types';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { formatPhone } from '@/shared/lib/utils/phone';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { parseCalendarDate, calendarDateToday, DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useLinkDriver, useUnlinkDriver } from '../../hooks/use-eld-linking';
import { EldLinkDialog } from '../../components/eld-link-dialog';
import { useIntegrations } from '@/features/integrations/hooks/use-integrations';
import { DeactivationDialog, ReactivationDialog } from '@/shared/components/deactivation-dialog';
import { showSuccess, showError } from '@sally/ui';
import { apiClient } from '@/shared/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import {
  Pencil,
  Phone,
  Mail,
  Shield,
  Truck,
  Package,
  Clock,
  MapPin,
  AlertCircle,
  User,
  FileText,
  ExternalLink,
  DollarSign,
  Link2,
  Link2Off,
  Unlink,
  UserMinus,
  RotateCcw,
  Paperclip,
  MoreHorizontal,
  Lock,
  Copy,
  RefreshCw,
} from 'lucide-react';

interface DriverDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: Driver | null;
  onMutate?: () => void;
  onInviteClick?: (driver: Driver) => void;
}

export default function DriverDetailSheet({
  open,
  onOpenChange,
  driver,
  onMutate,
  onInviteClick,
}: DriverDetailSheetProps) {
  const { formatCalendarDate, formatTimestamp } = useFormatters();
  const { data: _hos } = useDriverHOS(driver?.driverId ?? '');
  const { data: refData } = useReferenceData(['cdl_class', 'endorsement', 'us_state']);
  const cdlClasses = refData?.cdl_class ?? [];
  const endorsementOptions = refData?.endorsement ?? [];
  const usStates = refData?.us_state ?? [];
  const [isEditing, setIsEditingRaw] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const updateDriver = useUpdateDriver();

  const setIsEditing = useCallback((editing: boolean) => {
    setIsEditingRaw(editing);
  }, []);

  // Fetch vehicles for assignment dropdown
  useEffect(() => {
    listVehicles()
      .then(setVehicles)
      .catch(() => {});
  }, []);

  const [editForm, setEditForm] = useState<
    UpdateDriverRequest & {
      assignedVehicleId?: number | null;
      customFieldValues?: Record<string, string | number | null>;
    }
  >({
    name: '',
    phone: '',
    email: '',
    cdlClass: undefined,
    licenseNumber: '',
    licenseState: '',
    endorsements: [],
    hireDate: '',
    medicalCardExpiry: '',
    homeTerminalCity: '',
    homeTerminalState: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    notes: '',
    assignedVehicleId: null,
    cdlExpiry: '',
    mvrDate: '',
    drugTestDate: '',
    annualReviewDate: '',
    customFieldValues: {} as Record<string, string | number | null>,
  });
  const [payStructureOpen, setPayStructureOpen] = useState(false);
  const [eldLinkDialogOpen, setEldLinkDialogOpen] = useState(false);
  const [eldCandidates, setEldCandidates] = useState<{ eldId: string; name: string; detail: string }[]>([]);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [deactivateBlockers, setDeactivateBlockers] = useState<{ message: string; items: string[] } | null>(null);
  const linkDriver = useLinkDriver();
  const unlinkDriver = useUnlinkDriver();
  const { data: integrations } = useIntegrations();
  const hasEldIntegration =
    integrations?.some(
      (i) => i.integrationType === 'ELD' && i.isEnabled && ['ACTIVE', 'CONFIGURED'].includes(i.status),
    ) ?? false;
  const { data: payStructure } = usePayStructure(driver?.driverId ?? '');

  const initEditForm = useCallback(() => {
    if (!driver) return;
    setSaveError(null);
    setEditForm({
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customFieldValues: ((driver as any).customFieldValues ?? {}) as Record<string, string | number | null>,
    });
  }, [driver]);

  const handleEndorsementToggle = (value: string) => {
    const current = editForm.endorsements || [];
    if (current.includes(value)) {
      setEditForm({ ...editForm, endorsements: current.filter((e) => e !== value) });
    } else {
      setEditForm({ ...editForm, endorsements: [...current, value] });
    }
  };

  const handleSave = async () => {
    if (!driver) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        ...editForm,
        phone: editForm.phone?.trim() || undefined,
        email: editForm.email?.trim() || undefined,
        licenseState: editForm.licenseState?.trim() || undefined,
        hireDate: editForm.hireDate?.trim() || undefined,
        medicalCardExpiry: editForm.medicalCardExpiry?.trim() || undefined,
        homeTerminalCity: editForm.homeTerminalCity?.trim() || undefined,
        homeTerminalState: editForm.homeTerminalState?.trim() || undefined,
        emergencyContactName: editForm.emergencyContactName?.trim() || undefined,
        emergencyContactPhone: editForm.emergencyContactPhone?.trim() || undefined,
        notes: editForm.notes?.trim() || undefined,
        endorsements: editForm.endorsements?.length ? editForm.endorsements : undefined,
        assignedVehicleId: editForm.assignedVehicleId,
        cdlExpiry: editForm.cdlExpiry?.trim() ? new Date(editForm.cdlExpiry).toISOString() : undefined,
        mvrDate: editForm.mvrDate?.trim() ? new Date(editForm.mvrDate).toISOString() : undefined,
        drugTestDate: editForm.drugTestDate?.trim() ? new Date(editForm.drugTestDate).toISOString() : undefined,
        annualReviewDate: editForm.annualReviewDate?.trim()
          ? new Date(editForm.annualReviewDate).toISOString()
          : undefined,
      };
      await updateDriver.mutateAsync({ driverId: driver.driverId, data: payload });
      setIsEditing(false);
      onMutate?.();
    } catch (err) {
      const msg = extractErrorMessage(err);
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset edit state on driver change
  useEffect(() => {
    setIsEditing(false);
  }, [driver?.driverId, setIsEditing]);

  if (!driver) return null;

  const externalSource = driver.externalSource ? getSourceLabel(driver.externalSource) : undefined;

  // Format pay structure display
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

  const handleLinkEld = () => {
    if (!driver) return;
    linkDriver.mutate(
      { driverDbId: driver.id, eldId: undefined },
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
    if (!driver) return;
    linkDriver.mutate(
      { driverDbId: driver.id, eldId },
      {
        onSuccess: (data) => {
          if (data.linked) setEldLinkDialogOpen(false);
        },
      },
    );
  };

  const handleUnlinkEld = () => {
    if (!driver) return;
    unlinkDriver.mutate(driver.id);
  };

  const handleDeactivate = async (reason: string) => {
    try {
      await driversApi.deactivate(driver.driverId, reason);
      showSuccess('Driver deactivated');
      setDeactivateOpen(false);
      setDeactivateBlockers(null);
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
        setDeactivateBlockers({
          message: data?.message ?? 'Cannot deactivate driver',
          items: [
            ...(data?.activeLoads || []).map((l) => `Load ${l.loadId} (${l.status})`),
            ...(data?.activeRoutePlans || []).map((rp: string) => `Route Plan ${rp}`),
          ],
        });
      } else {
        showError('Failed to deactivate driver');
      }
    }
  };

  const handleReactivate = async () => {
    try {
      await driversApi.reactivate(driver.driverId);
      showSuccess('Driver reactivated');
      setReactivateOpen(false);
      onOpenChange(false);
      onMutate?.();
    } catch {
      showError('Failed to reactivate driver');
    }
  };

  const handleCopyInviteLink = async (invitationId: string) => {
    try {
      const data = await apiClient<{ inviteLink: string }>(`/invitations/${invitationId}/link`);
      await navigator.clipboard.writeText(data.inviteLink);
      showSuccess('Link copied');
    } catch {
      showError('Failed to copy link');
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    try {
      await apiClient(`/invitations/${invitationId}/resend`, { method: 'POST' });
      showSuccess('Invitation resent');
    } catch {
      showError('Failed to resend invitation');
    }
  };

  const eldMetadata = driver.eldMetadata as {
    eldId?: string;
    username?: string;
    eldVendor?: string;
    lastSyncAt?: string;
  } | null;
  const isEldLinked = !!eldMetadata?.eldId;

  const payTypeLabel: Record<string, string> = {
    PER_MILE: 'Per Mile',
    PERCENTAGE: 'Percentage',
    FLAT_RATE: 'Flat Rate',
    HYBRID: 'Hybrid',
  };

  // HOS calculations
  const driveRemaining = driver.currentHos?.driveRemaining ?? 11 - (driver.currentHoursDriven ?? 0);
  const shiftRemaining = driver.currentHos?.shiftRemaining ?? 14 - (driver.currentOnDutyTime ?? 0);
  const cycleRemaining = driver.currentHos?.cycleRemaining ?? 70 - (driver.cycleHoursUsed ?? 0);

  // Medical card expiry
  const medicalDaysRemaining = driver.medicalCardExpiry
    ? (() => {
        const { year: ey, month: em, day: ed } = parseCalendarDate(driver.medicalCardExpiry);
        const { year: ty, month: tm, day: td } = parseCalendarDate(calendarDateToday());
        return Math.ceil((Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / (1000 * 60 * 60 * 24));
      })()
    : null;

  const cdlLabel = cdlClasses.find((c) => c.code === driver.cdlClass);

  // Parse driver.id to number for document entity ID
  const parsedId = typeof driver.id === 'string' ? parseInt(driver.id, 10) : driver.id;
  const driverEntityId = Number.isNaN(parsedId) ? null : parsedId;

  const viewFooter = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(!driver.sallyAccessStatus || driver.sallyAccessStatus === 'NO_ACCESS') && onInviteClick && (
            <DropdownMenuItem onClick={() => onInviteClick(driver)}>
              <Mail className="h-4 w-4 mr-2" />
              Invite to SALLY
            </DropdownMenuItem>
          )}
          {driver.sallyAccessStatus === 'INVITED' && driver.pendingInvitationId && (
            <>
              <DropdownMenuItem onClick={() => handleCopyInviteLink(driver.pendingInvitationId!)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Invite Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleResendInvitation(driver.pendingInvitationId!)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Resend Invitation
              </DropdownMenuItem>
            </>
          )}
          {!driver.externalSource && (driver.status === 'ACTIVE' || driver.status === 'PENDING_ACTIVATION') && (
            <DropdownMenuItem className="text-critical" onClick={() => setDeactivateOpen(true)}>
              <UserMinus className="h-4 w-4 mr-2" />
              Deactivate
            </DropdownMenuItem>
          )}
          {driver.status === 'INACTIVE' && (
            <DropdownMenuItem onClick={() => setReactivateOpen(true)}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
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
        title={driver.name}
        description={`Driver details for ${driver.name}`}
        mode={isEditing ? 'edit' : 'view'}
        onSubmit={handleSave}
        onCancel={() => setIsEditing(false)}
        submitLabel="Save Changes"
        isSubmitting={isSaving}
        entityType="driver"
        pinnable
        resizable
        footerExtra={isEditing ? undefined : viewFooter}
        headerActions={
          <div className="flex items-center gap-2">
            <Badge
              variant={driver.status === 'ACTIVE' ? 'default' : driver.status === 'INACTIVE' ? 'muted' : 'outline'}
            >
              {driver.status || 'Unknown'}
            </Badge>
            {driver.sallyAccessStatus === 'ACTIVE' && (
              <Badge variant="default" className="text-xs">
                SALLY
              </Badge>
            )}
            {driver.sallyAccessStatus === 'INVITED' && (
              <Badge variant="muted" className="text-xs">
                SALLY Invited
              </Badge>
            )}
          </div>
        }
      >
        <p className="text-xs text-muted-foreground -mt-4 mb-4">{driver.driverId}</p>
        {/* Deactivation Banner */}
        {driver.status === 'INACTIVE' && (
          <div className={`p-3 rounded-md ${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.border}`}>
            <p className={`text-sm font-medium ${SEMANTIC_COLORS.caution.text}`}>Driver Deactivated</p>
            {driver.deactivationReason && (
              <p className="text-sm text-muted-foreground mt-1">Reason: {driver.deactivationReason}</p>
            )}
            {driver.deactivatedAt && (
              <p className="text-xs text-muted-foreground mt-1">Since {formatTimestamp(driver.deactivatedAt)}</p>
            )}
          </div>
        )}

        {/* TMS Lock Banner */}
        {isEditing && driver.externalSource && (
          <Alert className="mt-4 bg-info/10 border-info/20">
            <AlertDescription className="text-sm text-foreground">
              <Lock className="h-3 w-3 inline mr-1" />
              Some fields are managed by <span className="font-medium">{externalSource}</span> and cannot be edited
              here.
            </AlertDescription>
          </Alert>
        )}

        {/* Save Error Banner */}
        {isEditing && saveError && (
          <Alert className="mt-4 bg-destructive/10 border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-sm">{saveError}</AlertDescription>
          </Alert>
        )}

        {/* Content */}
        <div className="space-y-5">
          {/* 1. HOS Status */}
          <SheetSection icon={Clock} title="HOS Status">
            {driver.hosDataSource || driver.currentHos ? (
              <div className="space-y-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(driver as any).hosManualOverride && (
                  <div
                    className={`flex items-start gap-2 p-3 rounded-md ${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.border}`}
                  >
                    <AlertCircle className={`h-4 w-4 ${SEMANTIC_COLORS.caution.text} mt-0.5 shrink-0`} />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium">Manual HOS override active</p>
                      {(driver as { hosOverrideReason?: string }).hosOverrideReason && (
                        <p className="mt-1">{(driver as { hosOverrideReason?: string }).hosOverrideReason}</p>
                      )}
                    </div>
                  </div>
                )}
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
                      {barPct < 10 && (
                        <p className="text-xs text-critical">
                          {label === 'Break' ? 'Break required soon' : `${label} time critically low`}
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground mt-2">
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
            {isEditing ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Primary Vehicle</Label>
                    <Select
                      value={editForm.assignedVehicleId?.toString() || 'none'}
                      onValueChange={(val) =>
                        setEditForm({ ...editForm, assignedVehicleId: val === 'none' ? null : parseInt(val) })
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
                      value={editForm.homeTerminalCity}
                      onChange={(e) => setEditForm({ ...editForm, homeTerminalCity: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-terminal-state">Home Terminal State</Label>
                    <Select
                      value={editForm.homeTerminalState || ''}
                      onValueChange={(value) => setEditForm({ ...editForm, homeTerminalState: value })}
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
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem
                  label="Primary Vehicle"
                  value={driver.assignedVehicle ? driver.assignedVehicle.unitNumber : 'Not assigned'}
                />
                <div>
                  <span className="text-xs text-muted-foreground">Current Load</span>
                  {driver.currentLoad ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <Package className="h-3 w-3" />
                      <span className="text-sm text-foreground">{driver.currentLoad.referenceNumber}</span>
                      <Badge variant="outline">{driver.currentLoad.status}</Badge>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-0.5">&mdash;</p>
                  )}
                </div>
                <InfoItem
                  label="Home Terminal"
                  value={
                    driver.homeTerminalCity && driver.homeTerminalState
                      ? `${driver.homeTerminalCity}, ${driver.homeTerminalState}`
                      : undefined
                  }
                  icon={<MapPin className="h-3 w-3" />}
                />
                <InfoItem label="Timezone" value={driver.homeTerminalTimezone} />
              </div>
            )}
          </SheetSection>

          {/* 3. Personal Information */}
          <SheetSection icon={User} title="Personal Information">
            {isEditing ? (
              <>
                <div className={`mb-4 ${externalSource ? 'opacity-60' : ''}`}>
                  <Label htmlFor="edit-name">
                    Name {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                  </Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
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
                      value={editForm.phone ?? ''}
                      onChange={(e164) => setEditForm({ ...editForm, phone: e164 })}
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
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      disabled={!!externalSource}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-ec-name">Emergency Contact Name</Label>
                    <Input
                      id="edit-ec-name"
                      value={editForm.emergencyContactName}
                      onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-ec-phone">Emergency Contact Phone</Label>
                    <PhoneInput
                      id="edit-ec-phone"
                      value={editForm.emergencyContactPhone ?? ''}
                      onChange={(e164) => setEditForm({ ...editForm, emergencyContactPhone: e164 })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="Phone" value={formatPhone(driver.phone)} icon={<Phone className="h-3 w-3" />} />
                <InfoItem label="Email" value={driver.email} icon={<Mail className="h-3 w-3" />} />
                <InfoItem label="Emergency Contact" value={driver.emergencyContactName} />
                <InfoItem label="Emergency Phone" value={formatPhone(driver.emergencyContactPhone)} />
              </div>
            )}
          </SheetSection>

          {/* 4. Compliance & License */}
          <SheetSection icon={Shield} title="Compliance & License">
            {isEditing ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={externalSource ? 'opacity-60' : ''}>
                    <Label htmlFor="edit-cdl">
                      CDL Class {externalSource && <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />}
                    </Label>
                    <Select
                      value={editForm.cdlClass || ''}
                      onValueChange={(value) => setEditForm({ ...editForm, cdlClass: value as 'A' | 'B' | 'C' })}
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
                      value={editForm.licenseNumber}
                      onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })}
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
                      value={editForm.licenseState || ''}
                      onValueChange={(value) => setEditForm({ ...editForm, licenseState: value })}
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
                          checked={(editForm.endorsements || []).includes(opt.code)}
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
                      value={editForm.hireDate || ''}
                      onChange={(e) => setEditForm({ ...editForm, hireDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-medical">Medical Card Expiry</Label>
                    <Input
                      id="edit-medical"
                      type="date"
                      value={editForm.medicalCardExpiry || ''}
                      onChange={(e) => setEditForm({ ...editForm, medicalCardExpiry: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-cdl-expiry">CDL Expiry</Label>
                    <Input
                      id="edit-cdl-expiry"
                      type="date"
                      value={editForm.cdlExpiry || ''}
                      onChange={(e) => setEditForm({ ...editForm, cdlExpiry: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-mvr-date">Last MVR Date</Label>
                    <Input
                      id="edit-mvr-date"
                      type="date"
                      value={editForm.mvrDate || ''}
                      onChange={(e) => setEditForm({ ...editForm, mvrDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="edit-drug-test">Last Drug Test</Label>
                    <Input
                      id="edit-drug-test"
                      type="date"
                      value={editForm.drugTestDate || ''}
                      onChange={(e) => setEditForm({ ...editForm, drugTestDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-annual-review">Last Annual Review</Label>
                    <Input
                      id="edit-annual-review"
                      type="date"
                      value={editForm.annualReviewDate || ''}
                      onChange={(e) => setEditForm({ ...editForm, annualReviewDate: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem
                    label="License"
                    value={
                      driver.licenseNumber
                        ? `${driver.licenseNumber}${driver.licenseState ? ` (${driver.licenseState})` : ''}`
                        : undefined
                    }
                  />
                  <div>
                    <span className="text-xs text-muted-foreground">CDL Class</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {driver.cdlClass ? (
                        <Badge variant="outline">Class {driver.cdlClass}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">&mdash;</span>
                      )}
                      {cdlLabel && (
                        <span className="text-xs text-muted-foreground">{cdlLabel.metadata?.description}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-xs text-muted-foreground">Endorsements</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {driver.endorsements && driver.endorsements.length > 0 ? (
                      driver.endorsements.map((e) => {
                        const opt = endorsementOptions.find((o) => o.code === e);
                        return (
                          <Badge key={e} variant="muted">
                            {opt?.label || e}
                          </Badge>
                        );
                      })
                    ) : (
                      <span className="text-sm text-muted-foreground">None</span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <span className="text-xs text-muted-foreground">Medical Card Expiry</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {driver.medicalCardExpiry ? (
                        <>
                          <span className="text-sm text-foreground">
                            {formatCalendarDate(driver.medicalCardExpiry, DISPLAY_FORMATS.FRIENDLY)}
                          </span>
                          {medicalDaysRemaining !== null && medicalDaysRemaining <= 0 && (
                            <Badge variant="destructive">EXPIRED</Badge>
                          )}
                          {medicalDaysRemaining !== null && medicalDaysRemaining > 0 && medicalDaysRemaining <= 30 && (
                            <Badge variant="caution">{medicalDaysRemaining}d left</Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">&mdash;</span>
                      )}
                    </div>
                  </div>
                  <InfoItem
                    label="Hire Date"
                    value={driver.hireDate ? formatCalendarDate(driver.hireDate, DISPLAY_FORMATS.FRIENDLY) : undefined}
                  />
                </div>
              </>
            )}
          </SheetSection>

          {/* 5. Pay Structure */}
          <SheetSection icon={DollarSign} title="Pay Structure">
            {payStructure ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{payTypeLabel[payStructure.type] ?? payStructure.type}</Badge>
                    <span className="text-sm font-medium text-foreground">{formatPayRate()}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setPayStructureOpen(true)}>
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
                <Button variant="outline" size="sm" onClick={() => setPayStructureOpen(true)}>
                  Configure
                </Button>
              </div>
            )}
          </SheetSection>

          {/* 6. Notes */}
          <SheetSection icon={FileText} title="Notes" defaultOpen={false}>
            {isEditing ? (
              <div>
                <Label htmlFor="edit-notes" className="sr-only">
                  Notes
                </Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Add notes about this driver..."
                />
              </div>
            ) : driver.notes ? (
              <p className="text-sm text-foreground whitespace-pre-wrap">{driver.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes</p>
            )}
          </SheetSection>

          {/* 7. Integration */}
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
                {/* TMS sub-section */}
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

                {/* ELD sub-section */}
                {hasEldIntegration && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-foreground">ELD</h4>
                    {isEldLinked ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="default">Linked</Badge>
                          <span className="text-sm text-foreground">{eldMetadata?.username || eldMetadata?.eldId}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <InfoItem label="ELD ID" value={eldMetadata?.eldId} mono />
                          <InfoItem label="Vendor" value={eldMetadata?.eldVendor} />
                          <InfoItem
                            label="Last Synced"
                            value={
                              eldMetadata?.lastSyncAt ? new Date(eldMetadata.lastSyncAt).toLocaleString() : undefined
                            }
                          />
                        </div>
                        <Button variant="outline" size="sm" onClick={handleUnlinkEld} loading={unlinkDriver.isPending}>
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
                            Not linked to ELD. HOS data will not sync for this driver until linked.
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleLinkEld} loading={linkDriver.isPending}>
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

          {/* 8. Documents */}
          {driverEntityId != null && (
            <SheetSection icon={Paperclip} title="Documents" defaultOpen={false}>
              <CollapsibleDocumentsSection entityType="driver" entityId={driverEntityId} />
            </SheetSection>
          )}

          {/* 9. Custom Fields */}
          <CustomFieldsSection
            entityType="DRIVER"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            values={(isEditing ? editForm.customFieldValues : (driver as any).customFieldValues) ?? {}}
            onChange={(values) => setEditForm((prev) => ({ ...prev, customFieldValues: values }))}
            mode={isEditing ? 'edit' : 'view'}
          />
        </div>
      </FormSheet>

      {/* Pay Structure Sheet */}
      <PayStructureSheet
        driverId={driver.driverId}
        driverName={driver.name}
        open={payStructureOpen}
        onOpenChange={setPayStructureOpen}
      />

      {/* ELD Link Dialog */}
      <EldLinkDialog
        open={eldLinkDialogOpen}
        onOpenChange={setEldLinkDialogOpen}
        entityType="driver"
        candidates={eldCandidates}
        onLink={handleManualLink}
        isLinking={linkDriver.isPending}
      />

      {/* Deactivation/Reactivation Dialogs */}
      <DeactivationDialog
        open={deactivateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeactivateOpen(false);
            setDeactivateBlockers(null);
          }
        }}
        entityType="driver"
        entityName={driver.name}
        onConfirm={handleDeactivate}
        blockers={deactivateBlockers}
      />
      <ReactivationDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        entityName={driver.name}
        onConfirm={handleReactivate}
        deactivatedAt={driver.deactivatedAt}
        deactivationReason={driver.deactivationReason}
      />
    </>
  );
}
