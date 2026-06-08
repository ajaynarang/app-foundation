'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RecurringLane, CreateRecurringLaneStop } from '../types';
import {
  useActivateLane,
  usePauseLane,
  useResumeLane,
  useGenerateNow,
  useSkipGeneration,
  useExpireLane,
  useDeleteLane,
  useUpdateLane,
} from '../hooks/use-recurring-lanes';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Separator } from '@sally/ui/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Switch } from '@sally/ui/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { InfoItem } from '@sally/ui/components/ui/info-item';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { showError } from '@sally/ui';
import { CustomerPicker } from '@/features/fleet/customers/components/customer-picker';
import { LaneIntelligenceCard } from '@/features/fleet/loads/components/load-tabs/shared/LaneIntelligenceCard';
import { StopLocationPicker, type SelectedStop } from '@/features/fleet/stops/components/StopLocationPicker';
import {
  Pencil,
  CalendarDays,
  Truck,
  MapPin,
  BarChart3,
  MoreHorizontal,
  SkipForward,
  Pause,
  Clock,
  Trash2,
  Plus,
  ChevronRight,
} from 'lucide-react';

interface LaneDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lane: RecurringLane | null;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
  active: 'bg-muted text-muted-foreground border-border',
  paused: 'bg-caution/10 text-caution border-caution/20',
  expired: 'bg-muted text-muted-foreground border-border',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SCHEDULE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const EQUIPMENT_TYPES = [
  { value: 'DRY_VAN', label: 'Dry Van' },
  { value: 'FLATBED', label: 'Flatbed' },
  { value: 'REEFER', label: 'Reefer' },
  { value: 'STEP_DECK', label: 'Step Deck' },
  { value: 'POWER_ONLY', label: 'Power Only' },
];

const DAY_LABELS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

interface LaneStopFormData {
  id: string;
  selectedStop: SelectedStop | null;
  sequenceOrder: number;
  actionType: string;
  estimatedDockHours: string;
  dayOffset: string;
  facilityNotes: string;
  earliestArrival: string;
  latestArrival: string;
}

function emptyStop(seq: number): LaneStopFormData {
  return {
    id: crypto.randomUUID(),
    selectedStop: null,
    sequenceOrder: seq,
    actionType: seq === 1 ? 'pickup' : 'delivery',
    estimatedDockHours: '2',
    dayOffset: '0',
    facilityNotes: '',
    earliestArrival: '',
    latestArrival: '',
  };
}

function getStopColor(actionType: string) {
  if (actionType === 'pickup')
    return {
      dot: 'bg-info/10 text-info',
      badge: 'border-info/30 text-info',
    };
  if (actionType === 'both')
    return {
      dot: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300',
      badge: 'border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300',
    };
  return {
    dot: 'bg-muted text-muted-foreground',
    badge: 'border-border text-muted-foreground',
  };
}

function getStopBadgeLabel(actionType: string) {
  if (actionType === 'pickup') return 'P';
  if (actionType === 'both') return 'P/D';
  return 'D';
}

function formatSchedule(lane: RecurringLane): string {
  const type = lane.scheduleType.charAt(0).toUpperCase() + lane.scheduleType.slice(1);
  if (lane.scheduleType === 'weekly' && lane.scheduleDays?.length) {
    const days = lane.scheduleDays.map((d) => DAY_NAMES[d] ?? d).join(', ');
    return `${type} (${days})`;
  }
  return type;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRate(cents: number | null | undefined): string {
  if (cents == null) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

interface EditFormState {
  name: string;
  customerId: number | null;
  customerName: string;
  requiredEquipmentType: string;
  commodityType: string;
  weightLbs: string;
  rateDollars: string;
  pieces: string;
  specialRequirements: string;
  referenceNumber: string;
  scheduleType: string;
  scheduleDays: number[];
  autoCreate: boolean;
  effectiveFrom: string;
  effectiveUntil: string;
}

export function LaneDetailSheet({ open, onOpenChange, lane }: LaneDetailSheetProps) {
  const sizing = useSheetSizing('lane');
  const activateLane = useActivateLane();
  const pauseLane = usePauseLane();
  const resumeLane = useResumeLane();
  const generateNow = useGenerateNow();
  const skipGeneration = useSkipGeneration();
  const expireLane = useExpireLane();
  const deleteLane = useDeleteLane();
  const updateLane = useUpdateLane();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    customerId: null,
    customerName: '',
    requiredEquipmentType: '',
    commodityType: '',
    weightLbs: '',
    rateDollars: '',
    pieces: '',
    specialRequirements: '',
    referenceNumber: '',
    scheduleType: 'weekly',
    scheduleDays: [1],
    autoCreate: false,
    effectiveFrom: '',
    effectiveUntil: '',
  });
  const [editStops, setEditStops] = useState<LaneStopFormData[]>([emptyStop(1), emptyStop(2)]);
  const [expandedStop, setExpandedStop] = useState<number | null>(null);

  const onClose = () => onOpenChange(false);

  // Reset edit state when lane changes
  useEffect(() => {
    setIsEditing(false);
  }, [lane?.id]);

  const initEditForm = useCallback(() => {
    if (!lane) return;
    setEditForm({
      name: lane.name,
      customerId: lane.customerId ?? null,
      customerName: lane.customerName,
      requiredEquipmentType: lane.requiredEquipmentType || '',
      commodityType: lane.commodityType,
      weightLbs: String(lane.weightLbs),
      rateDollars: lane.rateCents ? (lane.rateCents / 100).toFixed(2) : '',
      pieces: lane.pieces ? String(lane.pieces) : '',
      specialRequirements: lane.specialRequirements || '',
      referenceNumber: lane.referenceNumber || '',
      scheduleType: lane.scheduleType,
      scheduleDays: lane.scheduleDays || [1],
      autoCreate: lane.autoCreate,
      effectiveFrom: lane.effectiveFrom || '',
      effectiveUntil: lane.effectiveUntil || '',
    });

    // Populate stops
    if (lane.stops?.length) {
      setEditStops(
        lane.stops
          .slice()
          .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
          .map((s) => ({
            id: crypto.randomUUID(),
            selectedStop: s.stopId
              ? {
                  id: s.stopId,
                  stopId: s.stopName || `Stop ${s.stopId}`,
                  name: s.stopName || `Stop ${s.stopId}`,
                  address: s.stopAddress || '',
                  city: s.stopCity || '',
                  state: s.stopState || '',
                  zipCode: '',
                }
              : null,
            sequenceOrder: s.sequenceOrder,
            actionType: s.actionType,
            estimatedDockHours: String(s.estimatedDockHours),
            dayOffset: String(s.dayOffset),
            facilityNotes: s.facilityNotes || '',
            earliestArrival: s.earliestArrival || '',
            latestArrival: s.latestArrival || '',
          })),
      );
    } else {
      setEditStops([emptyStop(1), emptyStop(2)]);
    }
    setExpandedStop(null);
  }, [lane]);

  function updateEditField<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDay(day: number) {
    setEditForm((prev) => ({
      ...prev,
      scheduleDays: prev.scheduleDays.includes(day)
        ? prev.scheduleDays.filter((d) => d !== day)
        : [...prev.scheduleDays, day],
    }));
  }

  function addStop() {
    const newStop = emptyStop(editStops.length + 1);
    setEditStops((prev) => [...prev, newStop]);
    setExpandedStop(editStops.length);
  }

  function removeStop(index: number) {
    setEditStops((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, sequenceOrder: i + 1 })));
    if (expandedStop === index) {
      setExpandedStop(null);
    } else if (expandedStop !== null && expandedStop > index) {
      setExpandedStop(expandedStop - 1);
    }
  }

  function updateStop(index: number, field: keyof LaneStopFormData, value: string) {
    setEditStops((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function handleStopLocationChange(index: number, selected: SelectedStop | null) {
    setEditStops((prev) => prev.map((s, i) => (i === index ? { ...s, selectedStop: selected } : s)));
  }

  const handleSave = useCallback(async () => {
    if (!lane) return;

    const missingFields: string[] = [];
    if (!editForm.name) missingFields.push('Lane Name');
    if (!editForm.customerId) missingFields.push('Customer');
    if (!editForm.commodityType) missingFields.push('Commodity');
    if (!editForm.weightLbs) missingFields.push('Weight');

    const stopsWithLocation = editStops.filter((s) => s.selectedStop);
    if (stopsWithLocation.length < 2) {
      missingFields.push('At least 2 stops with locations');
    }

    if (missingFields.length > 0) {
      showError('Missing required fields', `Please fill in: ${missingFields.join(', ')}`);
      return;
    }

    const rateCentsValue = editForm.rateDollars ? Math.round(parseFloat(editForm.rateDollars) * 100) : undefined;

    const stopsData: CreateRecurringLaneStop[] = stopsWithLocation.map((s, i) => ({
      stopId: s.selectedStop!.id!,
      sequenceOrder: i + 1,
      actionType: s.actionType as 'pickup' | 'delivery' | 'both',
      earliestArrival: s.earliestArrival || undefined,
      latestArrival: s.latestArrival || undefined,
      estimatedDockHours: parseFloat(s.estimatedDockHours) || 2,
      dayOffset: parseInt(s.dayOffset, 10) || 0,
      facilityNotes: s.facilityNotes || undefined,
    }));

    setIsSaving(true);
    try {
      await updateLane.mutateAsync({
        id: lane.id,
        data: {
          name: editForm.name,
          customerId: editForm.customerId ?? undefined,
          customerName: editForm.customerName,
          requiredEquipmentType: editForm.requiredEquipmentType || undefined,
          commodityType: editForm.commodityType,
          weightLbs: parseFloat(editForm.weightLbs),
          rateCents: rateCentsValue,
          pieces: editForm.pieces ? parseInt(editForm.pieces, 10) : undefined,
          specialRequirements: editForm.specialRequirements || undefined,
          referenceNumber: editForm.referenceNumber || undefined,
          scheduleType: editForm.scheduleType,
          scheduleDays: editForm.scheduleType === 'weekly' ? editForm.scheduleDays : undefined,
          autoCreate: editForm.autoCreate,
          effectiveFrom: editForm.effectiveFrom || undefined,
          effectiveUntil: editForm.effectiveUntil || undefined,
          stops: stopsData,
        },
      });
      setIsEditing(false);
    } catch {
      // Hook already shows error toast via onError
    } finally {
      setIsSaving(false);
    }
  }, [lane, editForm, editStops, updateLane]);

  if (!lane) return null;

  const stops = lane.stops ?? [];
  const isExpired = lane.status === 'EXPIRED';

  // Derive lane identity for rate intelligence
  const sortedStops = stops.slice().sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const laneOriginState = sortedStops.find((s) => s.actionType === 'pickup' || s.actionType === 'both')?.stopState;
  const laneDestState = [...sortedStops]
    .reverse()
    .find((s) => s.actionType === 'delivery' || s.actionType === 'both')?.stopState;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full p-0 flex flex-col"
        pinnable
        resizable
        defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
        onInteractOutside={(e) => {
          if (isEditing) e.preventDefault();
        }}
        defaultPinned={isEditing}
      >
        {/* Sticky Header */}
        <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="lane" /> : undefined}>
          <div className="flex items-center gap-3">
            <SheetTitle className="text-lg truncate">{lane.name}</SheetTitle>
            <Badge variant="outline" className={STATUS_BADGE_CLASSES[lane.status] ?? ''}>
              {lane.status.charAt(0).toUpperCase() + lane.status.slice(1)}
            </Badge>
          </div>
          <p className="text-xs font-mono text-muted-foreground">{lane.laneId}</p>
          <SheetDescription className="sr-only">Lane details for {lane.name}</SheetDescription>
        </SheetHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Lane Info */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5" /> Lane Info
            </h3>
            {isEditing ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-lane-name">Lane Name *</Label>
                  <Input
                    id="edit-lane-name"
                    value={editForm.name}
                    onChange={(e) => updateEditField('name', e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Customer *</Label>
                  <CustomerPicker
                    value={editForm.customerId}
                    onChange={(id, name) => {
                      updateEditField('customerId', id);
                      updateEditField('customerName', name);
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Equipment Type</Label>
                    <Select
                      value={editForm.requiredEquipmentType}
                      onValueChange={(v) => updateEditField('requiredEquipmentType', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {EQUIPMENT_TYPES.map((eq) => (
                          <SelectItem key={eq.value} value={eq.value}>
                            {eq.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-commodity">Commodity *</Label>
                    <Input
                      id="edit-commodity"
                      value={editForm.commodityType}
                      onChange={(e) => updateEditField('commodityType', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-effective-from">Effective From</Label>
                    <Input
                      id="edit-effective-from"
                      type="date"
                      value={editForm.effectiveFrom}
                      onChange={(e) => updateEditField('effectiveFrom', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-effective-until">Effective Until</Label>
                    <Input
                      id="edit-effective-until"
                      type="date"
                      value={editForm.effectiveUntil}
                      onChange={(e) => updateEditField('effectiveUntil', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="Customer" value={lane.customerName} />
                <InfoItem label="Equipment Type" value={lane.requiredEquipmentType} />
                <InfoItem label="Commodity" value={lane.commodityType} />
                <InfoItem label="Schedule" value={formatSchedule(lane)} />
                <InfoItem label="Effective From" value={formatDate(lane.effectiveFrom)} />
                <InfoItem label="Effective Until" value={formatDate(lane.effectiveUntil)} />
              </div>
            )}
          </section>

          <Separator />

          {/* Load Template */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Truck className="h-3.5 w-3.5" /> Load Template
            </h3>
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-weight">Weight (lbs) *</Label>
                    <Input
                      id="edit-weight"
                      type="number"
                      min="0"
                      max="200000"
                      value={editForm.weightLbs}
                      onChange={(e) => updateEditField('weightLbs', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-rate">Rate ($)</Label>
                    <Input
                      id="edit-rate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="999999.99"
                      value={editForm.rateDollars}
                      onChange={(e) => updateEditField('rateDollars', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-pieces">Pieces</Label>
                    <Input
                      id="edit-pieces"
                      type="number"
                      min="0"
                      max="99999"
                      value={editForm.pieces}
                      onChange={(e) => updateEditField('pieces', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-ref">Reference #</Label>
                    <Input
                      id="edit-ref"
                      value={editForm.referenceNumber}
                      onChange={(e) => updateEditField('referenceNumber', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-special">Special Requirements</Label>
                  <Textarea
                    id="edit-special"
                    value={editForm.specialRequirements}
                    onChange={(e) => updateEditField('specialRequirements', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoItem label="Weight" value={lane.weightLbs ? `${lane.weightLbs.toLocaleString()} lbs` : null} />
                <InfoItem label="Rate" value={formatRate(lane.rateCents)} />
                <InfoItem label="Pieces" value={lane.pieces?.toString()} />
                <InfoItem label="Reference #" value={lane.referenceNumber} mono />
                {lane.specialRequirements && (
                  <div className="col-span-2">
                    <InfoItem label="Special Requirements" value={lane.specialRequirements} />
                  </div>
                )}
              </div>
            )}
          </section>

          <Separator />

          {/* Stops */}
          {isEditing ? (
            <>
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> Stops ({editStops.length})
                  </h3>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addStop}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Stop
                  </Button>
                </div>

                <div className="relative">
                  {/* Vertical connector line */}
                  {editStops.length > 1 && (
                    <div className="absolute left-[1.2rem] top-[1.5rem] bottom-[1.5rem] w-px bg-border z-0" />
                  )}

                  <div className="space-y-1.5 relative z-10">
                    {editStops.map((stop, index) => {
                      const colors = getStopColor(stop.actionType);
                      return (
                        <div key={stop.id}>
                          {/* Compact stop row */}
                          <div
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors cursor-pointer group ${
                              expandedStop === index ? 'bg-accent/70' : 'hover:bg-accent/40'
                            }`}
                            onClick={() => setExpandedStop(expandedStop === index ? null : index)}
                          >
                            {/* Stop number dot */}
                            <div
                              className={`flex-shrink-0 flex items-center justify-center w-[30px] h-[30px] rounded-full text-xs font-bold ${colors.dot}`}
                            >
                              {index + 1}
                            </div>

                            {/* Stop summary */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`text-2xs px-1.5 py-0 h-5 flex-shrink-0 ${colors.badge}`}
                              >
                                {getStopBadgeLabel(stop.actionType)}
                              </Badge>
                              <span className="text-sm text-foreground truncate">
                                {stop.selectedStop?.name || (
                                  <span className="text-muted-foreground italic">No location</span>
                                )}
                              </span>
                              {(stop.selectedStop?.city || stop.selectedStop?.state) && (
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  {[stop.selectedStop.city, stop.selectedStop.state].filter(Boolean).join(', ')}
                                </span>
                              )}
                              {(stop.earliestArrival || stop.latestArrival) && (
                                <span className="text-2xs text-muted-foreground flex-shrink-0 font-mono">
                                  {stop.earliestArrival || '?'}&ndash;
                                  {stop.latestArrival || '?'}
                                </span>
                              )}
                            </div>

                            {/* Expand indicator + delete */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {editStops.length > 2 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeStop(index);
                                  }}
                                  className="h-6 w-6 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-critical transition-opacity"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                              <ChevronRight
                                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                  expandedStop === index ? 'rotate-90' : ''
                                }`}
                              />
                            </div>
                          </div>

                          {/* Expanded stop details */}
                          {expandedStop === index && (
                            <div className="ml-[42px] mt-1 mb-2 p-3 rounded-md border border-border bg-card space-y-3">
                              <StopLocationPicker
                                value={stop.selectedStop}
                                onChange={(s) => handleStopLocationChange(index, s)}
                              />

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">Type</Label>
                                  <Select
                                    value={stop.actionType}
                                    onValueChange={(v) => updateStop(index, 'actionType', v)}
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
                                  <Label className="text-[11px] text-muted-foreground">Day Offset</Label>
                                  <Input
                                    className="h-8 text-sm"
                                    type="number"
                                    min="0"
                                    max="30"
                                    value={stop.dayOffset}
                                    onChange={(e) => updateStop(index, 'dayOffset', e.target.value)}
                                  />
                                  <p className="text-2xs text-muted-foreground mt-0.5">Days after freight date</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">Dock hours</Label>
                                  <Input
                                    className="h-8 text-sm"
                                    type="number"
                                    min="0"
                                    max="72"
                                    step="0.5"
                                    value={stop.estimatedDockHours}
                                    onChange={(e) => updateStop(index, 'estimatedDockHours', e.target.value)}
                                  />
                                </div>
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">Arrival window</Label>
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      className="h-8 text-sm font-mono"
                                      value={stop.earliestArrival}
                                      onChange={(e) => updateStop(index, 'earliestArrival', e.target.value)}
                                      placeholder="06:00"
                                      maxLength={5}
                                    />
                                    <span className="text-muted-foreground text-xs">&ndash;</span>
                                    <Input
                                      className="h-8 text-sm font-mono"
                                      value={stop.latestArrival}
                                      onChange={(e) => updateStop(index, 'latestArrival', e.target.value)}
                                      placeholder="14:00"
                                      maxLength={5}
                                    />
                                  </div>
                                </div>
                              </div>

                              <div>
                                <Label className="text-[11px] text-muted-foreground">Facility Notes</Label>
                                <Input
                                  className="h-8 text-sm mt-1"
                                  placeholder="Dock #, check-in instructions..."
                                  value={stop.facilityNotes}
                                  onChange={(e) => updateStop(index, 'facilityNotes', e.target.value)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <Separator />
            </>
          ) : stops.length > 0 ? (
            <>
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" /> Stops ({stops.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Location</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead className="hidden sm:table-cell">Dock Hrs</TableHead>
                      <TableHead className="hidden sm:table-cell">Day Offset</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stops
                      .slice()
                      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                      .map((stop) => (
                        <TableRow key={stop.id ?? stop.sequenceOrder}>
                          <TableCell className="text-muted-foreground">{stop.sequenceOrder}</TableCell>
                          <TableCell className="font-medium text-foreground">{stop.stopName || '\u2014'}</TableCell>
                          <TableCell className="hidden sm:table-cell text-foreground">
                            {stop.stopCity && stop.stopState
                              ? `${stop.stopCity}, ${stop.stopState}`
                              : stop.stopCity || stop.stopState || '\u2014'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {stop.actionType}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-foreground">
                            {stop.estimatedDockHours}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-foreground">{stop.dayOffset}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </section>

              <Separator />
            </>
          ) : null}

          {/* Lane Rate Intelligence (view mode only) */}
          {!isEditing && (
            <LaneIntelligenceCard
              originState={laneOriginState ?? undefined}
              destState={laneDestState ?? undefined}
              equipmentType={lane.requiredEquipmentType ?? undefined}
              loadRateCents={lane.rateCents}
              loadEstimatedMiles={lane.estimatedMiles}
            />
          )}

          {/* Schedule (edit mode only — in view mode, schedule is shown in Lane Info) */}
          {isEditing && (
            <>
              <section>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" /> Schedule
                </h3>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Schedule Type</Label>
                    <Select value={editForm.scheduleType} onValueChange={(v) => updateEditField('scheduleType', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SCHEDULE_TYPES.map((st) => (
                          <SelectItem key={st.value} value={st.value}>
                            {st.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editForm.scheduleType === 'weekly' && (
                    <div className="space-y-2">
                      <Label>Days of Week</Label>
                      <div className="flex gap-1">
                        {DAY_LABELS.map((day) => (
                          <Button
                            key={day.value}
                            variant={editForm.scheduleDays.includes(day.value) ? 'default' : 'outline'}
                            size="sm"
                            className="h-8 w-10 text-xs"
                            onClick={() => toggleDay(day.value)}
                          >
                            {day.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-foreground">Auto-create loads</p>
                      <p className="text-xs text-muted-foreground">Automatically generate loads on schedule</p>
                    </div>
                    <Switch checked={editForm.autoCreate} onCheckedChange={(v) => updateEditField('autoCreate', v)} />
                  </div>
                </div>
              </section>

              <Separator />
            </>
          )}

          {/* Generation Stats (always view-only) */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5" /> Generation Stats
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoItem label="Auto-Create" value={lane.autoCreate ? 'Yes' : 'No'} />
              <InfoItem label="Next Generation" value={formatDate(lane.nextGenerationDate)} />
              <InfoItem label="Skip Next" value={lane.skipNextGeneration ? 'Yes' : 'No'} />
              <InfoItem label="Last Generated" value={formatDate(lane.lastGeneratedAt)} />
              <InfoItem label="Total Loads Generated" value={lane.totalLoadsGenerated.toString()} />
            </div>
          </section>
        </div>

        {/* Sticky Actions Footer */}
        {isEditing ? (
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={isSaving}>
              Save Changes
            </Button>
          </div>
        ) : !isExpired ? (
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            {/* Overflow menu (left) */}
            <AlertDialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {lane.status === 'ACTIVE' && (
                    <DropdownMenuItem onClick={() => skipGeneration.mutate(lane.id)}>
                      <SkipForward className="mr-2 h-4 w-4" />
                      Skip Next Generation
                    </DropdownMenuItem>
                  )}
                  {lane.status === 'ACTIVE' && (
                    <DropdownMenuItem onClick={() => pauseLane.mutate(lane.id)}>
                      <Pause className="mr-2 h-4 w-4" />
                      Pause
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => expireLane.mutate(lane.id)}>
                    <Clock className="mr-2 h-4 w-4" />
                    Expire
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete lane?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove &quot;{lane.name}&quot; from your lanes. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      deleteLane.mutate(lane.id);
                      onClose();
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex-1" />

            {/* Edit button (always visible in view mode) */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                initEditForm();
                setIsEditing(true);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>

            {/* Primary action (right) */}
            {lane.status === 'DRAFT' && (
              <Button size="sm" loading={activateLane.isPending} onClick={() => activateLane.mutate(lane.id)}>
                Activate
              </Button>
            )}
            {lane.status === 'ACTIVE' && (
              <Button size="sm" loading={generateNow.isPending} onClick={() => generateNow.mutate(lane.id)}>
                Generate Now
              </Button>
            )}
            {lane.status === 'PAUSED' && (
              <Button size="sm" loading={resumeLane.isPending} onClick={() => resumeLane.mutate(lane.id)}>
                Resume
              </Button>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
