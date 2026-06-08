'use client';

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Link2,
  Map,
  ChevronRight,
  CalendarIcon,
  MoreHorizontal,
  UserPlus,
  Truck,
  Package,
  Play,
  Pencil,
  RotateCcw,
  ArrowDownUp,
  Users,
  Ban,
  Pause,
  Download,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { calendarDateToDate, dateToCalendarDate, DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import type { Load, CreateLoadStopInput as LoadStopCreate } from '@/features/fleet/loads/types';
import { formatLoadLabel } from '@sally/shared-types';
import { useBillingReadiness } from '@/features/financials/close-out/hooks/use-close-out';
import { CustomerPicker } from '@/features/fleet/customers/components/customer-picker';
import type { ReferenceDataMap } from '@/features/platform/reference-data';
import { RevertLoadDialog } from './RevertLoadDialog';
import { RemoveExchangeAlertDialog } from './RemoveExchangeAlertDialog';
import { LoadTabContainer } from './load-tabs/LoadTabContainer';
import { StopTimeline } from './load-tabs/shared/StopTimeline';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Calendar } from '@sally/ui/components/ui/calendar';
import { StopLocationPicker } from '@/features/fleet/stops/components/StopLocationPicker';
import {
  ConfidenceBanner,
  ConfidenceDot,
  getConfirmationIssues,
  useEditedFields,
  worstStopConfidence,
} from './draft-confidence';
import type { RateconConfidence, LoadLeg } from '@/features/fleet/loads/types';
import { ExchangePointEditor } from './ExchangePointEditor';
import { LegTimeline } from './LegTimeline';
import { showError, showSuccess } from '@sally/ui';
import { CustomFieldsSection } from '@/features/fleet/custom-fields';
import { useMutation } from '@tanstack/react-query';
import { loadsApi } from '@/features/fleet/loads/api';
import { useRelayEnabled, useLoadLegs, useCreateLegs } from '@/features/fleet/loads/hooks/use-load-legs';
import { RELAY_BADGE_CLASS } from '@/features/fleet/loads/constants/relay';
import { TripContextBar } from '@/features/fleet/trips/components/TripContextBar';
import { Switch } from '@sally/ui/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';

// ============================================================================
// Constants
// ============================================================================

export const US_STATES_FALLBACK = [
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

export const EQUIPMENT_TYPES_FALLBACK = [
  { code: 'dry_van', label: 'Dry Van' },
  { code: 'reefer', label: 'Reefer' },
  { code: 'flatbed', label: 'Flatbed' },
  { code: 'step_deck', label: 'Step Deck' },
];

// ============================================================================
// Helpers
// ============================================================================

export function getStatusVariant(status: string): 'default' | 'muted' | 'destructive' | 'outline' {
  const variants: Record<string, 'default' | 'muted' | 'destructive' | 'outline'> = {
    DRAFT: 'outline',
    PENDING: 'outline',
    ASSIGNED: 'default',
    IN_TRANSIT: 'default',
    ON_HOLD: 'outline',
    DELIVERED: 'muted',
    CANCELLED: 'destructive',
    TONU: 'destructive',
  };
  return variants[status] || 'outline';
}

// ============================================================================
// LoadDetailPanel
// ============================================================================

export interface LoadDetailPanelProps {
  load: Load;
  onStatusChange: (loadId: string, status: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSaveDraft?: (loadId: string, data: any) => Promise<void>;
  onDuplicate: (loadId: string) => void;
  onCopyTrackingLink: (loadId: string) => void;
  onAssign?: (loadId: string) => void;
  onDelete?: (loadId: string) => void;
  onEditingChange?: (editing: boolean) => void;
  refData?: ReferenceDataMap;
  headerExtra?: ReactNode;
  /** When true, hides all edit/action buttons — view-only mode */
  readOnly?: boolean;
  onViewTrip?: (tripId: string) => void;
  /** Tab to open initially in the detail tabs. Used by deep-links. */
  defaultTab?: string;
}

export function LoadDetailPanel({
  load,
  onStatusChange,
  onSaveDraft,
  onDuplicate,
  onCopyTrackingLink,
  onAssign,
  onEditingChange,
  refData,
  headerExtra,
  readOnly = false,
  onViewTrip,
  defaultTab,
}: LoadDetailPanelProps) {
  const { formatCalendarDate } = useFormatters();
  const isDraft = load.status === 'DRAFT';
  const isDelivered = load.status === 'DELIVERED';
  const isEditable = isDraft || load.status === 'PENDING' || load.status === 'ASSIGNED';
  const [isEditing, setIsEditingRaw] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const REVERSIBLE_STATUSES = ['IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'TONU'];
  const canRevert = REVERSIBLE_STATUSES.includes(load.status);
  const setIsEditing = useCallback(
    (editing: boolean) => {
      setIsEditingRaw(editing);
      onEditingChange?.(editing);
    },
    [onEditingChange],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [expandedStop, setExpandedStop] = useState<number | null>(null);

  // ── Edit form state ──
  const [editForm, setEditForm] = useState({
    customerName: '',
    customerId: undefined as number | undefined,
    referenceNumber: '',
    rateCents: undefined as number | undefined,
    weightLbs: 0,
    requiredEquipmentType: undefined as string | undefined,
    commodityType: undefined as string | undefined,
    pieces: undefined as number | undefined,
    specialRequirements: '',
    customFieldValues: undefined as Record<string, string | number | null> | undefined,
  });
  const [editStops, setEditStops] = useState<LoadStopCreate[]>([]);

  // ── Confidence tracking (draft AI-parsed loads) ──
  const { editedFields, markEdited, reset: resetEdited } = useEditedFields();
  const confidence: RateconConfidence | null = useMemo(() => {
    if (load.intakeSource !== 'import' || !load.intakeMetadata?.confidence) return null;
    return load.intakeMetadata.confidence as RateconConfidence;
  }, [load.intakeSource, load.intakeMetadata]);

  const confirmationIssues = useMemo(
    () => (isDraft ? getConfirmationIssues(load, editForm, editStops, editedFields) : []),
    [isDraft, load, editForm, editStops, editedFields],
  );
  const canConfirm = confirmationIssues.length === 0;

  // ── Relay state ──
  const relayEnabled = useRelayEnabled();
  const { data: legs } = useLoadLegs(relayEnabled && load.isRelay ? load.loadNumber : '');
  const createLegsMutation = useCreateLegs();
  const [draftExchangePoints, setDraftExchangePoints] = useState<import('./ExchangePointEditor').ExchangePointDraft[]>(
    [],
  );
  const [markedStopIds, setMarkedStopIds] = useState<number[]>([]);
  const hasLegs = !!(legs && legs.length > 0);
  const [isReconfiguring, setIsReconfiguring] = useState(false);

  const allLegsPending = useMemo(() => {
    if (!legs || legs.length === 0) return false;
    return legs.every((l: LoadLeg) => l.status === 'PENDING' && !l.driverName);
  }, [legs]);

  const existingExchangeStopIds = useMemo(
    () => (load.stops ?? []).filter((s) => s.actionType === 'exchange').map((s) => s.id),
    [load.stops],
  );

  // ── Remove-exchange dialog state ──
  // Holds the LoadStop being removed (the join row PK + a display name for the
  // dialog header). The actual API call + classification happens in
  // <RemoveExchangeAlertDialog>; this component just tracks open state.
  const [removeExchangeTarget, setRemoveExchangeTarget] = useState<{ loadStopId: number; displayName: string } | null>(
    null,
  );

  const canToggleRelay = useMemo(() => {
    if (!load.isRelay) return true;
    if (!legs || legs.length === 0) return true;
    return legs.every((l: LoadLeg) => !l.driverName);
  }, [load.isRelay, legs]);

  const legTimelineData = useMemo(() => {
    if (!legs) return [];
    const stops = load.stops ?? [];
    const stopById = Object.fromEntries(stops.map((s) => [s.id, s]));
    return legs.map((leg: LoadLeg) => {
      const origin = stopById[leg.originStopId];
      const dest = stopById[leg.destStopId];
      return {
        legId: leg.legId,
        sequence: leg.sequence,
        status: leg.status,
        driverName: leg.driverName ?? null,
        vehicleUnitNumber: leg.vehicleUnitNumber ?? null,
        actualMiles: leg.actualMiles ?? null,
        assignedAt: leg.assignedAt ?? null,
        pickedUpAt: leg.pickedUpAt ?? null,
        deliveredAt: leg.deliveredAt ?? null,
        originCity: origin?.stopCity ?? '',
        originState: origin?.stopState ?? '',
        destCity: dest?.stopCity ?? '',
        destState: dest?.stopState ?? '',
      };
    });
  }, [legs, load.stops]);

  // ── Dispatch sheet ──
  // Relay loads: per-leg dispatch sheets via leg endpoints
  const dispatchLegs = useMemo(() => {
    if (load.isRelay && legs && legs.length > 0) return legs;
    if (load.isRelay && load.legs && load.legs.length > 0) return load.legs;
    return [];
  }, [load.isRelay, load.legs, legs]);

  // Relay: leg-level mutations
  const downloadLegDispatchSheet = useMutation({
    mutationFn: ({ legId }: { legId: string }) => loadsApi.getDispatchSheetPdf(load.loadNumber, legId),
    onSuccess: (blob, { legId }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispatch-sheet-${load.loadNumber}-leg-${legId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Dispatch sheet downloaded');
    },
    onError: (err: Error) => {
      showError('Download failed', err.message);
    },
  });

  const sendLegDispatchSheet = useMutation({
    mutationFn: ({ legId }: { legId: string }) => loadsApi.sendDispatchSheet(load.loadNumber, legId),
    onSuccess: (data) => {
      showSuccess(`Dispatch sheet sent to ${data.sentTo}`);
    },
    onError: (err: Error) => {
      showError('Send failed', err.message);
    },
  });

  // Non-relay: load-level mutations
  const downloadLoadDispatchSheet = useMutation({
    mutationFn: () => loadsApi.getLoadDispatchSheetPdf(load.loadNumber),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dispatch-sheet-${load.loadNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Dispatch sheet downloaded');
    },
    onError: (err: Error) => {
      showError('Download failed', err.message);
    },
  });

  const sendLoadDispatchSheet = useMutation({
    mutationFn: () => loadsApi.sendLoadDispatchSheet(load.loadNumber),
    onSuccess: (data) => {
      showSuccess(`Dispatch sheet sent to ${data.sentTo}`);
    },
    onError: (err: Error) => {
      showError('Send failed', err.message);
    },
  });

  // ── Data queries ──
  const { data: readiness } = useBillingReadiness(isDelivered ? load.loadNumber : null);

  // ── Lifecycle ──
  useEffect(() => {
    setIsEditing(false);
    setIsReconfiguring(false);
    resetEdited();
  }, [load.loadNumber, setIsEditing, resetEdited]);

  const isFieldEditable = (field: string) => {
    if (isDraft) return true;
    if (load.status === 'PENDING') return true;
    if (load.status === 'ASSIGNED') {
      const restrictedFields = ['requiredEquipmentType', 'commodityType', 'stops'];
      return !restrictedFields.includes(field);
    }
    return false;
  };

  const initEditForm = useCallback(() => {
    setEditForm({
      customerName: load.customerName || '',
      customerId: load.customerId ?? undefined,
      referenceNumber: load.referenceNumber || '',
      rateCents: load.rateCents,
      weightLbs: load.weightLbs || 0,
      requiredEquipmentType: load.requiredEquipmentType || undefined,
      commodityType: load.commodityType || undefined,
      pieces: load.pieces,
      specialRequirements: load.specialRequirements || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customFieldValues: ((load as any).customFieldValues ?? {}) as Record<string, string | number | null>,
    });
    setEditStops(
      (load.stops ?? []).map((s) => ({
        stopId: s.stopStopId || `STOP-EDIT-${Date.now()}-${s.sequenceOrder}`,
        sequenceOrder: s.sequenceOrder,
        actionType: s.actionType as 'pickup' | 'delivery' | 'both',
        estimatedDockHours: s.estimatedDockHours,
        earliestArrival: s.earliestArrival || '',
        latestArrival: s.latestArrival || '',
        appointmentDate: s.appointmentDate || '',
        name: s.stopName || '',
        address: s.stopAddress || '',
        city: s.stopCity || '',
        state: s.stopState || '',
        zipCode: s.stopZipCode || '',
      })),
    );
  }, [load]);

  useEffect(() => {
    if (isDraft && load) initEditForm();
  }, [load, isDraft, initEditForm]);

  // True iff the user touched a stop control during this edit session.
  // We use a prefix scan because individual stop edits register as
  // "stop-1-location", "stop-2-appointmentDate", "stop-add", etc.
  const stopsDirty = useMemo(() => {
    for (const f of editedFields) {
      if (f.startsWith('stop-')) return true;
    }
    return false;
  }, [editedFields]);

  // ── Handlers ──
  const handleSave = async () => {
    if (!onSaveDraft) return;
    setIsSaving(true);
    try {
      // Only send `stops` when the user actually edited the route. Otherwise the
      // backend sees an unchanged stops array, which used to trigger a destructive
      // deleteMany+recreate path that broke FK constraints from existing relay legs.
      const saveData = isFieldEditable('stops') && stopsDirty ? { ...editForm, stops: editStops } : { ...editForm };
      await onSaveDraft(load.loadNumber, saveData);
      if (isEditing) setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (onSaveDraft) {
      setIsSaving(true);
      try {
        await onSaveDraft(load.loadNumber, { ...editForm, stops: editStops });
      } finally {
        setIsSaving(false);
      }
    }
    onStatusChange(load.loadNumber, 'PENDING');
  };

  const addEditStop = () => {
    setEditStops([
      ...editStops,
      {
        stopId: `STOP-EDIT-${Date.now()}`,
        sequenceOrder: editStops.length + 1,
        actionType: 'delivery',
        estimatedDockHours: 2,
        earliestArrival: '',
        latestArrival: '',
        appointmentDate: '',
        name: '',
        city: '',
        state: '',
      },
    ]);
  };

  const removeEditStop = (index: number) => {
    if (editStops.length <= 2) return;
    const newStops = editStops.filter((_, i) => i !== index);
    setEditStops(newStops.map((s, i) => ({ ...s, sequenceOrder: i + 1 })));
  };

  const updateEditStop = (index: number, field: string, value: string | number) => {
    const newStops = [...editStops];
    newStops[index] = { ...newStops[index], [field]: value };
    setEditStops(newStops);
  };

  const handleEditStopLocationChange = (
    index: number,
    selected: {
      id?: number;
      stopId: string;
      name: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      lat?: number;
      lon?: number;
    } | null,
  ) => {
    const newStops = [...editStops];
    if (selected) {
      newStops[index] = {
        ...newStops[index],
        stopId: selected.stopId,
        name: selected.name,
        address: selected.address || '',
        city: selected.city || '',
        state: selected.state || '',
        zipCode: selected.zipCode || '',
      };
    } else {
      newStops[index] = {
        ...newStops[index],
        stopId: `STOP-${Date.now().toString(36)}`,
        name: '',
        address: '',
        city: '',
        state: '',
        zipCode: '',
      };
    }
    setEditStops(newStops);
    markEdited(`stop-${index + 1}-location`);
  };

  const handleCreateLegs = async () => {
    if (draftExchangePoints.length > 0 && onSaveDraft) {
      const currentStops = (load.stops ?? []).map((s) => ({
        stopId: s.stopStopId || `STOP-${s.id}`,
        sequenceOrder: s.sequenceOrder,
        actionType: s.actionType,
        estimatedDockHours: s.estimatedDockHours,
        earliestArrival: s.earliestArrival || '',
        latestArrival: s.latestArrival || '',
        appointmentDate: s.appointmentDate || '',
        name: s.stopName || '',
        address: s.stopAddress || '',
        city: s.stopCity || '',
        state: s.stopState || '',
        zipCode: s.stopZipCode || '',
      }));
      const sortedDrafts = [...draftExchangePoints].sort((a, b) => b.afterStopIndex - a.afterStopIndex);
      for (const draft of sortedDrafts) {
        currentStops.splice(draft.afterStopIndex + 1, 0, {
          // Prefer the persisted Stop's business id so the backend can dedupe;
          // fall back to a fresh temp id only if the draft was created without picker resolution.
          stopId: draft.stopBusinessId || `STOP-${Date.now().toString(36)}-${draft.tempId.slice(-4)}`,
          sequenceOrder: 0,
          actionType: 'exchange',
          estimatedDockHours: 0.5,
          earliestArrival: '',
          latestArrival: '',
          appointmentDate: '',
          name: draft.name,
          address: draft.address ?? '',
          city: draft.city,
          state: draft.state,
          zipCode: draft.zipCode ?? '',
        });
      }
      currentStops.forEach((s, i) => {
        s.sequenceOrder = i + 1;
      });
      await onSaveDraft(load.loadNumber, { stops: currentStops });
      setDraftExchangePoints([]);
      return;
    }
    const allExchangeStopIds = [...existingExchangeStopIds, ...markedStopIds];
    if (allExchangeStopIds.length > 0) {
      const stops = load.stops ?? [];
      const missing = stops.filter((s) => allExchangeStopIds.includes(s.id) && !s.stopLat && !s.stopLon);
      if (missing.length > 0) {
        showError(
          'Exchange points missing coordinates',
          `${missing.map((s) => s.stopName || s.stopCity || `Stop #${s.id}`).join(', ')} — save the load first to trigger geocoding, then retry.`,
        );
        return;
      }
      createLegsMutation.mutate({ loadId: load.loadNumber, data: { exchangeStopIds: allExchangeStopIds } });
      setMarkedStopIds([]);
      setIsReconfiguring(false);
    }
  };

  // ── Edit form content (rendered inside Overview tab when editing) ──
  const editFormContent =
    isDraft || isEditing ? (
      <div className="space-y-6">
        {isDraft && (
          <ConfidenceBanner
            confidence={confidence}
            editedFields={editedFields}
            confirmationIssues={confirmationIssues}
          />
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Customer
                <ConfidenceDot level={confidence?.broker_name} edited={editedFields.has('customerId')} />
              </Label>
              <CustomerPicker
                value={editForm.customerId ?? null}
                onChange={(id, name) => {
                  setEditForm({ ...editForm, customerId: id, customerName: name });
                  markEdited('customerId');
                }}
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Reference / PO #
                <ConfidenceDot level={confidence?.reference_number} edited={editedFields.has('referenceNumber')} />
              </Label>
              <Input
                className="h-9 mt-1"
                value={editForm.referenceNumber}
                onChange={(e) => {
                  setEditForm({ ...editForm, referenceNumber: e.target.value });
                  markEdited('referenceNumber');
                }}
                placeholder="PO-12345"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                Rate ($)
                <ConfidenceDot level={confidence?.rate} edited={editedFields.has('rateCents')} />
              </Label>
              <Input
                className="h-9 mt-1"
                type="number"
                step="0.01"
                min="0"
                max="999999.99"
                placeholder="2,450.00"
                value={editForm.rateCents !== undefined ? (editForm.rateCents / 100).toFixed(2) : ''}
                onChange={(e) => {
                  const dollars = parseFloat(e.target.value);
                  setEditForm({ ...editForm, rateCents: isNaN(dollars) ? undefined : Math.round(dollars * 100) });
                  markEdited('rateCents');
                }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Weight (lbs)</Label>
              <Input
                className="h-9 mt-1"
                type="number"
                min="0"
                max="200000"
                value={editForm.weightLbs || ''}
                onChange={(e) => setEditForm({ ...editForm, weightLbs: parseInt(e.target.value) || 0 })}
                placeholder="40,000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Equipment</Label>
              <Select
                value={editForm.requiredEquipmentType || undefined}
                onValueChange={(v) => setEditForm({ ...editForm, requiredEquipmentType: v })}
                disabled={!isFieldEditable('requiredEquipmentType')}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue
                    placeholder={confidence && !editForm.requiredEquipmentType ? 'Not detected' : 'Select equipment'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(
                    refData?.equipmentType?.map((item) => ({ code: item.code.toLowerCase(), label: item.label })) ??
                    EQUIPMENT_TYPES_FALLBACK
                  ).map((et) => (
                    <SelectItem key={et.code} value={et.code}>
                      {et.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Commodity</Label>
              <Select
                value={editForm.commodityType || undefined}
                onValueChange={(v) => setEditForm({ ...editForm, commodityType: v })}
                disabled={!isFieldEditable('commodityType')}
              >
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue
                    placeholder={confidence && !editForm.commodityType ? 'Not detected' : 'Select commodity'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="dry_goods">Dry Goods</SelectItem>
                  <SelectItem value="refrigerated">Refrigerated</SelectItem>
                  <SelectItem value="frozen">Frozen</SelectItem>
                  <SelectItem value="hazmat">Hazmat</SelectItem>
                  <SelectItem value="fragile">Fragile</SelectItem>
                  <SelectItem value="oversized">Oversized</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Pieces / Pallets</Label>
              <Input
                className="h-9 mt-1"
                type="number"
                min="0"
                max="99999"
                placeholder="26"
                value={editForm.pieces ?? ''}
                onChange={(e) =>
                  setEditForm({ ...editForm, pieces: e.target.value ? parseInt(e.target.value) : undefined })
                }
              />
            </div>
            <div className="col-span-2 sm:col-span-1" />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Special Requirements</Label>
            <Textarea
              className="mt-1"
              value={editForm.specialRequirements}
              onChange={(e) => setEditForm({ ...editForm, specialRequirements: e.target.value })}
              placeholder="Temp controlled, team, etc."
              rows={2}
            />
          </div>
        </div>

        {/* Custom Fields */}
        <CustomFieldsSection
          entityType="LOAD"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          values={
            (editForm.customFieldValues ?? (load as any).customFieldValues ?? {}) as Record<
              string,
              string | number | null
            >
          }
          onChange={(values) => setEditForm((prev) => ({ ...prev, customFieldValues: values }))}
          mode="edit"
        />
      </div>
    ) : undefined;

  // ── Edit route content (rendered inside Route tab when editing) ──
  const editRouteContent =
    isDraft || isEditing ? (
      <div className="space-y-6">
        {/* Editable stops */}
        {isFieldEditable('stops') ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Route</h4>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addEditStop}>
                <Plus className="h-3 w-3 mr-1" /> Add Stop
              </Button>
            </div>

            <div className="relative">
              {editStops.length > 1 && (
                <div className="absolute left-[1.2rem] top-[1.5rem] bottom-[1.5rem] w-px bg-border z-0" />
              )}
              <div className="space-y-1.5 relative z-10">
                {editStops.map((stop, index) => (
                  <div key={index}>
                    <div
                      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors cursor-pointer group ${
                        expandedStop === index ? 'bg-accent/70' : 'hover:bg-accent/40'
                      }`}
                      onClick={() => setExpandedStop(expandedStop === index ? null : index)}
                    >
                      <div
                        className={`flex-shrink-0 flex items-center justify-center w-[30px] h-[30px] rounded-full text-xs font-bold ${
                          stop.actionType === 'pickup'
                            ? 'bg-accent/10 text-accent'
                            : stop.actionType === 'both'
                              ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-2xs px-1.5 py-0 h-5 flex-shrink-0 ${
                            stop.actionType === 'pickup'
                              ? 'border-accent/30 text-accent'
                              : stop.actionType === 'both'
                                ? 'border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300'
                                : 'border-border text-muted-foreground'
                          }`}
                        >
                          {stop.actionType === 'pickup' ? 'P' : stop.actionType === 'both' ? 'P/D' : 'D'}
                        </Badge>
                        <span className="text-sm text-foreground truncate">
                          {stop.name || <span className="text-muted-foreground italic">No location</span>}
                        </span>
                        {(stop.city || stop.state) && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {[stop.city, stop.state].filter(Boolean).join(', ')}
                          </span>
                        )}
                        {(load.stops ?? [])[index]?.facilityUnverified && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="caution" className="text-2xs px-1.5 py-0 h-5 flex-shrink-0">
                                Verify facility
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              Location known, but the specific facility isn&apos;t confirmed. Click the stop to verify
                              the dock.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {confidence &&
                        (() => {
                          const stopConf = confidence.stops.find((s) => s.sequence === index + 1);
                          const level = worstStopConfidence(stopConf);
                          const edited =
                            editedFields.has(`stop-${index + 1}-location`) &&
                            (!stopConf?.date || editedFields.has(`stop-${index + 1}-date`));
                          return <ConfidenceDot level={level} edited={edited} />;
                        })()}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {editStops.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeEditStop(index);
                            }}
                            className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-critical transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        <ChevronRight
                          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedStop === index ? 'rotate-90' : ''}`}
                        />
                      </div>
                    </div>

                    {expandedStop === index && (
                      <div className="ml-[42px] mt-1 mb-2 p-3 rounded-md border border-border bg-card space-y-3">
                        <StopLocationPicker
                          value={
                            stop.name
                              ? {
                                  id: (() => {
                                    const thisStopDbId = (load.stops ?? [])[index]?.stopId;
                                    if (!thisStopDbId) return undefined;
                                    const isShared = (load.stops ?? []).some(
                                      (s, i) => i !== index && s.stopId === thisStopDbId,
                                    );
                                    return isShared ? undefined : thisStopDbId;
                                  })(),
                                  stopId: stop.stopId,
                                  name: stop.name,
                                  address: stop.address,
                                  city: stop.city,
                                  state: stop.state,
                                  zipCode: stop.zipCode,
                                  lat: (load.stops ?? [])[index]?.stopLat ?? undefined,
                                  lon: (load.stops ?? [])[index]?.stopLon ?? undefined,
                                }
                              : null
                          }
                          onChange={(selected) => handleEditStopLocationChange(index, selected)}
                          refData={
                            refData
                              ? { us_state: refData.us_state?.map((item) => ({ code: item.code, label: item.label })) }
                              : undefined
                          }
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Type</Label>
                            <Select
                              value={stop.actionType}
                              onValueChange={(v) => updateEditStop(index, 'actionType', v)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pickup">Pickup</SelectItem>
                                <SelectItem value="delivery">Delivery</SelectItem>
                                <SelectItem value="both">Both</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">Dock hrs</Label>
                            <Input
                              className="h-8 text-sm"
                              type="number"
                              step="0.5"
                              min="0"
                              max="72"
                              value={stop.estimatedDockHours}
                              onChange={(e) =>
                                updateEditStop(index, 'estimatedDockHours', parseFloat(e.target.value) || 0)
                              }
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Appointment date</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full h-8 text-sm justify-start text-left font-normal"
                              >
                                <CalendarIcon className="mr-2 h-3 w-3" />
                                {stop.appointmentDate
                                  ? formatCalendarDate(stop.appointmentDate, DISPLAY_FORMATS.FRIENDLY)
                                  : 'Select date'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={stop.appointmentDate ? calendarDateToDate(stop.appointmentDate) : undefined}
                                onSelect={(date) => {
                                  updateEditStop(index, 'appointmentDate', date ? dateToCalendarDate(date) : '');
                                  markEdited(`stop-${index + 1}-date`);
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Appointment window</Label>
                          <div className="flex items-center gap-1.5">
                            <Input
                              className="h-8 text-sm font-mono"
                              value={stop.earliestArrival || ''}
                              onChange={(e) => updateEditStop(index, 'earliestArrival', e.target.value)}
                              placeholder="06:00"
                              maxLength={5}
                            />
                            <span className="text-muted-foreground text-xs">--</span>
                            <Input
                              className="h-8 text-sm font-mono"
                              value={stop.latestArrival || ''}
                              onChange={(e) => updateEditStop(index, 'latestArrival', e.target.value)}
                              placeholder="14:00"
                              maxLength={5}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Read-only stops for assigned loads in edit mode */
          <StopTimeline stops={load.stops ?? []} />
        )}

        {/* Relay section */}
        {relayEnabled && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <ArrowDownUp className="h-4 w-4 text-purple-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Relay Mode</p>
                  <p className="text-xs text-muted-foreground">
                    Split the drive across multiple drivers at handoff points
                  </p>
                </div>
              </div>
              {canToggleRelay ? (
                <Switch
                  checked={load.isRelay ?? false}
                  onCheckedChange={async (checked) => {
                    if (onSaveDraft) {
                      await onSaveDraft(load.loadNumber, { isRelay: checked });
                      if (!checked) setDraftExchangePoints([]);
                    }
                  }}
                />
              ) : (
                <Badge variant="outline" className="text-2xs text-muted-foreground">
                  Drivers assigned — cannot disable
                </Badge>
              )}
            </div>

            {load.isRelay &&
              (isDraft || isEditing || isReconfiguring) &&
              (!hasLegs || isReconfiguring) &&
              (load.stops ?? []).length >= 2 && (
                <div className="space-y-3">
                  <ExchangePointEditor
                    stops={load.stops ?? []}
                    existingExchangeStopIds={existingExchangeStopIds}
                    markedStopIds={markedStopIds}
                    draftExchangePoints={draftExchangePoints}
                    onDraftExchangePointsChange={setDraftExchangePoints}
                    onMarkedStopIdsChange={setMarkedStopIds}
                    onRemoveExistingExchange={(loadStopId) => {
                      const target = (load.stops ?? []).find((s) => s.id === loadStopId);
                      const displayName = target?.stopName
                        ? `${target.stopName}${target.stopCity ? ` — ${target.stopCity}, ${target.stopState ?? ''}` : ''}`
                        : `Stop #${loadStopId}`;
                      setRemoveExchangeTarget({ loadStopId, displayName });
                    }}
                  />
                  {(existingExchangeStopIds.length > 0 ||
                    markedStopIds.length > 0 ||
                    draftExchangePoints.length > 0) && (
                    <div className="space-y-2">
                      {draftExchangePoints.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {draftExchangePoints.length} new exchange point{draftExchangePoints.length > 1 ? 's' : ''}{' '}
                          will be saved as stops.
                        </p>
                      )}
                      <Button
                        size="sm"
                        onClick={handleCreateLegs}
                        loading={createLegsMutation.isPending}
                        className="w-full"
                      >
                        <ArrowDownUp className="mr-1.5 h-3.5 w-3.5" />
                        {draftExchangePoints.length > 0
                          ? 'Save Exchange Points & Update Stops'
                          : `Create ${existingExchangeStopIds.length + markedStopIds.length + 1} Legs`}
                      </Button>
                    </div>
                  )}
                </div>
              )}

            {load.isRelay && hasLegs && !isReconfiguring && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Relay Legs</h4>
                    <Badge className={RELAY_BADGE_CLASS + ' text-2xs px-1.5 py-0 h-5'}>{legs!.length} legs</Badge>
                  </div>
                  {allLegsPending && ['DRAFT', 'PENDING'].includes(load.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setIsReconfiguring(true)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Reconfigure
                    </Button>
                  )}
                </div>
                <LegTimeline legs={legTimelineData} />
              </div>
            )}
          </div>
        )}
      </div>
    ) : undefined;

  // ── Render ──
  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <SheetHeader actions={headerExtra}>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">{formatLoadLabel(load.loadNumber, load.referenceNumber)}</span>
            <Badge variant={getStatusVariant(load.status)} className="text-xs">
              {load.status.replace(/_/g, ' ')}
            </Badge>
            {relayEnabled && load.isRelay && <Badge className={RELAY_BADGE_CLASS + ' text-2xs'}>◇ Relay</Badge>}
          </SheetTitle>
        </SheetHeader>

        {load.tripId && (
          <TripContextBar
            tripId={load.tripId}
            tripOrder={load.tripOrder}
            tripLoadCount={load.tripLoadCount}
            onViewTrip={() => onViewTrip?.(load.tripId!)}
          />
        )}

        <LoadTabContainer
          load={load}
          billingReadiness={readiness}
          onDuplicate={() => onDuplicate(load.loadNumber)}
          editFormContent={editFormContent}
          editRouteContent={editRouteContent}
          isDraft={isDraft}
          isEditing={isEditing}
          readOnly={readOnly}
          defaultTab={defaultTab}
        />

        {/* Custom Fields — view-only when not editing/draft */}
        {!isDraft && !isEditing && (
          <div className="px-6 pb-4">
            <CustomFieldsSection
              entityType="LOAD"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              values={(load as any).customFieldValues ?? {}}
              mode="view"
            />
          </div>
        )}
      </div>

      {/* Sticky Action Footer — hidden in readOnly mode */}
      {!readOnly && (
        <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
          {isDraft && (
            <>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={handleSave} loading={isSaving}>
                Save Draft
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" onClick={handleConfirm} loading={isSaving} disabled={!canConfirm}>
                      Confirm Load
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canConfirm && (
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs font-medium mb-1">Cannot confirm — missing fields:</p>
                    <ul className="text-xs space-y-0.5">
                      {confirmationIssues.slice(0, 5).map((i) => (
                        <li key={i.field}>• {i.message}</li>
                      ))}
                      {confirmationIssues.length > 5 && <li>...and {confirmationIssues.length - 5} more</li>}
                    </ul>
                  </TooltipContent>
                )}
              </Tooltip>
            </>
          )}

          {isEditing && (
            <>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} loading={isSaving} disabled={editedFields.size === 0}>
                Save Changes
              </Button>
            </>
          )}

          {load.status === 'PENDING' && !isEditing && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {isEditable && (
                    <DropdownMenuItem
                      onClick={() => {
                        initEditForm();
                        setIsEditing(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {load.routePlan && (
                    <DropdownMenuItem asChild>
                      <Link href={`/dispatcher/smart-routes/${load.routePlan.planId}`}>
                        <Map className="mr-2 h-4 w-4" />
                        View Smart Route
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onStatusChange(load.loadNumber, 'DRAFT')}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Revert to Draft
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onStatusChange(load.loadNumber, 'CANCELLED')}
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Cancel Load
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex-1" />
              {load.routePlan && (
                <Link href={`/dispatcher/smart-routes/${load.routePlan.planId}`}>
                  <Button variant="outline" size="sm" className="inline-flex items-center whitespace-nowrap">
                    <Map className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                    Smart Route
                  </Button>
                </Link>
              )}
              {relayEnabled && load.isRelay && !hasLegs ? (
                <Button
                  size="sm"
                  onClick={() => {
                    initEditForm();
                    setIsEditing(true);
                  }}
                >
                  <ArrowDownUp className="mr-1.5 h-3.5 w-3.5" />
                  Configure Legs
                </Button>
              ) : relayEnabled && load.isRelay && hasLegs ? (
                <Button size="sm" onClick={() => onAssign?.(load.loadNumber)}>
                  <Users className="mr-1.5 h-3.5 w-3.5" />
                  Assign Drivers
                </Button>
              ) : (
                <Button size="sm" onClick={() => onAssign?.(load.loadNumber)}>
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Assign Driver
                </Button>
              )}
            </>
          )}

          {load.status === 'ASSIGNED' && !isEditing && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {isEditable && (
                    <DropdownMenuItem
                      onClick={() => {
                        initEditForm();
                        setIsEditing(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {load.routePlan && (
                    <DropdownMenuItem asChild>
                      <Link href={`/dispatcher/smart-routes/${load.routePlan!.planId}`}>
                        <Map className="mr-2 h-4 w-4" />
                        View Smart Route
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onCopyTrackingLink(load.loadNumber)}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Copy Tracking Link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(load.loadNumber)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {load.isRelay && dispatchLegs.length > 0 ? (
                    <>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Download className="mr-2 h-4 w-4" />
                          Download Dispatch Sheet
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {dispatchLegs.map((leg) => (
                            <DropdownMenuItem
                              key={leg.legId}
                              onClick={() => downloadLegDispatchSheet.mutate({ legId: leg.legId })}
                            >
                              Leg {leg.sequence}
                              {leg.driverName ? ` — ${leg.driverName}` : ''}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Send className="mr-2 h-4 w-4" />
                          Send Dispatch Sheet
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {dispatchLegs.map((leg) => (
                            <DropdownMenuItem
                              key={leg.legId}
                              disabled={!leg.driverName}
                              onClick={() => sendLegDispatchSheet.mutate({ legId: leg.legId })}
                            >
                              Leg {leg.sequence}
                              {leg.driverName ? ` — ${leg.driverName}` : ' (no driver)'}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  ) : (
                    !load.isRelay && (
                      <>
                        <DropdownMenuItem onClick={() => downloadLoadDispatchSheet.mutate()}>
                          <Download className="mr-2 h-4 w-4" />
                          Download Dispatch Sheet
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!load.driverName} onClick={() => sendLoadDispatchSheet.mutate()}>
                          <Send className="mr-2 h-4 w-4" />
                          Send Dispatch Sheet
                        </DropdownMenuItem>
                      </>
                    )
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onStatusChange(load.loadNumber, 'PENDING')}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Revert to Pending
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onStatusChange(load.loadNumber, 'CANCELLED')}
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Cancel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onStatusChange(load.loadNumber, 'TONU')}
                  >
                    <ArrowDownUp className="mr-2 h-4 w-4" />
                    TONU
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex-1" />
              {load.routePlan && (
                <Link href={`/dispatcher/smart-routes/${load.routePlan.planId}`}>
                  <Button variant="outline" size="sm" className="inline-flex items-center whitespace-nowrap">
                    <Map className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                    Smart Route
                  </Button>
                </Link>
              )}
              <Button size="sm" onClick={() => onStatusChange(load.loadNumber, 'IN_TRANSIT')}>
                <Truck className="mr-1.5 h-3.5 w-3.5" />
                Mark Picked Up
              </Button>
            </>
          )}

          {load.status === 'IN_TRANSIT' && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {load.routePlan && (
                    <DropdownMenuItem asChild>
                      <Link href={`/dispatcher/smart-routes/${load.routePlan!.planId}`}>
                        <Map className="mr-2 h-4 w-4" />
                        View Smart Route
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onCopyTrackingLink(load.loadNumber)}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Copy Tracking Link
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(load.loadNumber)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {load.isRelay && dispatchLegs.length > 0 ? (
                    <>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Download className="mr-2 h-4 w-4" />
                          Download Dispatch Sheet
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {dispatchLegs.map((leg) => (
                            <DropdownMenuItem
                              key={leg.legId}
                              onClick={() => downloadLegDispatchSheet.mutate({ legId: leg.legId })}
                            >
                              Leg {leg.sequence}
                              {leg.driverName ? ` — ${leg.driverName}` : ''}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Send className="mr-2 h-4 w-4" />
                          Send Dispatch Sheet
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {dispatchLegs.map((leg) => (
                            <DropdownMenuItem
                              key={leg.legId}
                              disabled={!leg.driverName}
                              onClick={() => sendLegDispatchSheet.mutate({ legId: leg.legId })}
                            >
                              Leg {leg.sequence}
                              {leg.driverName ? ` — ${leg.driverName}` : ' (no driver)'}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  ) : (
                    !load.isRelay && (
                      <>
                        <DropdownMenuItem onClick={() => downloadLoadDispatchSheet.mutate()}>
                          <Download className="mr-2 h-4 w-4" />
                          Download Dispatch Sheet
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!load.driverName} onClick={() => sendLoadDispatchSheet.mutate()}>
                          <Send className="mr-2 h-4 w-4" />
                          Send Dispatch Sheet
                        </DropdownMenuItem>
                      </>
                    )
                  )}
                  <DropdownMenuSeparator />
                  {canRevert && (
                    <DropdownMenuItem onClick={() => setRevertDialogOpen(true)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Revert Status
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onStatusChange(load.loadNumber, 'ON_HOLD')}>
                    <Pause className="mr-2 h-4 w-4" />
                    On Hold
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onStatusChange(load.loadNumber, 'CANCELLED')}
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Cancel
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onStatusChange(load.loadNumber, 'TONU')}
                  >
                    <ArrowDownUp className="mr-2 h-4 w-4" />
                    TONU
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex-1" />
              {load.routePlan && (
                <Link href={`/dispatcher/smart-routes/${load.routePlan.planId}`}>
                  <Button variant="outline" size="sm" className="inline-flex items-center whitespace-nowrap">
                    <Map className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                    Smart Route
                  </Button>
                </Link>
              )}
              <Button size="sm" onClick={() => onStatusChange(load.loadNumber, 'DELIVERED')}>
                <Package className="mr-1.5 h-3.5 w-3.5" />
                Mark Delivered
              </Button>
            </>
          )}

          {load.status === 'ON_HOLD' && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {load.driverId && (
                    <DropdownMenuItem onClick={() => onStatusChange(load.loadNumber, 'ASSIGNED')}>
                      <Play className="mr-2 h-4 w-4" />
                      Resume to Assigned
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onStatusChange(load.loadNumber, 'DRAFT')}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Move to Draft
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onStatusChange(load.loadNumber, 'CANCELLED')}
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Cancel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex-1" />
              <Button size="sm" onClick={() => onStatusChange(load.loadNumber, 'PENDING')}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Resume
              </Button>
            </>
          )}

          {load.status === 'DELIVERED' && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {canRevert && (
                    <DropdownMenuItem onClick={() => setRevertDialogOpen(true)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Revert Status
                    </DropdownMenuItem>
                  )}
                  {canRevert && <DropdownMenuSeparator />}
                  {load.isRelay && dispatchLegs.length > 0 ? (
                    <>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Download className="mr-2 h-4 w-4" />
                          Download Dispatch Sheet
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {dispatchLegs.map((leg) => (
                            <DropdownMenuItem
                              key={leg.legId}
                              onClick={() => downloadLegDispatchSheet.mutate({ legId: leg.legId })}
                            >
                              Leg {leg.sequence}
                              {leg.driverName ? ` — ${leg.driverName}` : ''}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Send className="mr-2 h-4 w-4" />
                          Send Dispatch Sheet
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {dispatchLegs.map((leg) => (
                            <DropdownMenuItem
                              key={leg.legId}
                              disabled={!leg.driverName}
                              onClick={() => sendLegDispatchSheet.mutate({ legId: leg.legId })}
                            >
                              Leg {leg.sequence}
                              {leg.driverName ? ` — ${leg.driverName}` : ' (no driver)'}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  ) : (
                    !load.isRelay && (
                      <>
                        <DropdownMenuItem onClick={() => downloadLoadDispatchSheet.mutate()}>
                          <Download className="mr-2 h-4 w-4" />
                          Download Dispatch Sheet
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!load.driverName} onClick={() => sendLoadDispatchSheet.mutate()}>
                          <Send className="mr-2 h-4 w-4" />
                          Send Dispatch Sheet
                        </DropdownMenuItem>
                      </>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => onDuplicate(load.loadNumber)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicate
              </Button>
            </>
          )}

          {(load.status === 'CANCELLED' || load.status === 'TONU') && (
            <>
              {canRevert && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setRevertDialogOpen(true)}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Revert Status
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => onDuplicate(load.loadNumber)}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicate
              </Button>
            </>
          )}
        </div>
      )}

      <RevertLoadDialog
        open={revertDialogOpen}
        onOpenChange={setRevertDialogOpen}
        loadId={load.loadNumber}
        loadNumber={load.loadNumber}
        currentStatus={load.status}
      />

      <RemoveExchangeAlertDialog
        open={removeExchangeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveExchangeTarget(null);
        }}
        loadId={load.loadNumber}
        stopId={removeExchangeTarget?.loadStopId ?? null}
        stopDisplayName={removeExchangeTarget?.displayName}
      />
    </>
  );
}
