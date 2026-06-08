'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Badge } from '@/shared/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { SheetKeyboardHint } from '@sally/ui/components/ui/form-sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import { Separator } from '@/shared/components/ui/separator';
import { showError } from '@/shared/lib/toast';
import { CustomerPicker } from '@/features/fleet/customers/components/customer-picker';
import { StopLocationPicker, type SelectedStop } from '@/features/fleet/stops/components/StopLocationPicker';
import { useCreateLane, useUpdateLane } from '../hooks/use-recurring-lanes';
import type { RecurringLane, CreateRecurringLaneStop } from '../types';

interface CreateLaneSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editLane?: RecurringLane | null;
}

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

export function CreateLaneSheet({ open, onOpenChange, editLane }: CreateLaneSheetProps) {
  const createLane = useCreateLane();
  const updateLane = useUpdateLane();

  // Form state
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [commodityType, setCommodityType] = useState('');
  const [weightLbs, setWeightLbs] = useState('');
  const [rateDollars, setRateDollars] = useState('');
  const [pieces, setPieces] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [scheduleType, setScheduleType] = useState('weekly');
  const [scheduleDays, setScheduleDays] = useState<number[]>([1]); // Mon default
  const [autoCreate, setAutoCreate] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [stops, setStops] = useState<LaneStopFormData[]>([emptyStop(1), emptyStop(2)]);
  const [expandedStop, setExpandedStop] = useState<number | null>(null);

  const isEditing = !!editLane;

  // Populate form when editing
  useEffect(() => {
    if (editLane) {
      setName(editLane.name);
      setCustomerId(editLane.customerId ?? null);
      setCustomerName(editLane.customerName);
      setEquipmentType(editLane.requiredEquipmentType || '');
      setCommodityType(editLane.commodityType);
      setWeightLbs(String(editLane.weightLbs));
      setRateDollars(editLane.rateCents ? (editLane.rateCents / 100).toFixed(2) : '');
      setPieces(editLane.pieces ? String(editLane.pieces) : '');
      setSpecialRequirements(editLane.specialRequirements || '');
      setReferenceNumber(editLane.referenceNumber || '');
      setScheduleType(editLane.scheduleType);
      setScheduleDays(editLane.scheduleDays || [1]);
      setAutoCreate(editLane.autoCreate);
      setEffectiveFrom(editLane.effectiveFrom || '');
      setEffectiveUntil(editLane.effectiveUntil || '');
      // Populate stops from existing lane
      if (editLane.stops?.length) {
        setStops(
          editLane.stops
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
        setStops([emptyStop(1), emptyStop(2)]);
      }
      setExpandedStop(null);
    } else {
      resetForm();
    }
  }, [editLane, open]);

  function resetForm() {
    setName('');
    setCustomerId(null);
    setCustomerName('');
    setEquipmentType('');
    setCommodityType('');
    setWeightLbs('');
    setRateDollars('');
    setPieces('');
    setSpecialRequirements('');
    setReferenceNumber('');
    setScheduleType('weekly');
    setScheduleDays([1]);
    setAutoCreate(false);
    setEffectiveFrom('');
    setEffectiveUntil('');
    setStops([emptyStop(1), emptyStop(2)]);
    setExpandedStop(null);
  }

  function toggleDay(day: number) {
    setScheduleDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function addStop() {
    const newStop = emptyStop(stops.length + 1);
    setStops((prev) => [...prev, newStop]);
    // Auto-expand the newly added stop
    setExpandedStop(stops.length);
  }

  function removeStop(index: number) {
    setStops((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, sequenceOrder: i + 1 })));
    // Collapse if the removed stop was expanded
    if (expandedStop === index) {
      setExpandedStop(null);
    } else if (expandedStop !== null && expandedStop > index) {
      setExpandedStop(expandedStop - 1);
    }
  }

  function updateStop(index: number, field: keyof LaneStopFormData, value: string) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function handleStopLocationChange(index: number, selected: SelectedStop | null) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, selectedStop: selected } : s)));
  }

  const handleSubmit = useCallback(async () => {
    const missingFields: string[] = [];
    if (!name) missingFields.push('Lane Name');
    if (!customerId) missingFields.push('Customer');
    if (!commodityType) missingFields.push('Commodity');
    if (!weightLbs) missingFields.push('Weight');

    const stopsWithLocation = stops.filter((s) => s.selectedStop);
    if (stopsWithLocation.length < 2) {
      missingFields.push('At least 2 stops with locations');
    }

    if (missingFields.length > 0) {
      showError('Missing required fields', `Please fill in: ${missingFields.join(', ')}`);
      return;
    }

    const rateCentsValue = rateDollars ? Math.round(parseFloat(rateDollars) * 100) : undefined;

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

    try {
      if (isEditing && editLane) {
        await updateLane.mutateAsync({
          id: editLane.id,
          data: {
            name,
            customerId: customerId ?? undefined,
            customerName,
            requiredEquipmentType: equipmentType || undefined,
            commodityType,
            weightLbs: parseFloat(weightLbs),
            rateCents: rateCentsValue,
            pieces: pieces ? parseInt(pieces, 10) : undefined,
            specialRequirements: specialRequirements || undefined,
            referenceNumber: referenceNumber || undefined,
            scheduleType,
            scheduleDays: scheduleType === 'weekly' ? scheduleDays : undefined,
            autoCreate,
            effectiveFrom: effectiveFrom || undefined,
            effectiveUntil: effectiveUntil || undefined,
            stops: stopsData,
          },
        });
      } else {
        await createLane.mutateAsync({
          name,
          customerId: customerId ?? undefined,
          customerName,
          requiredEquipmentType: equipmentType || undefined,
          commodityType,
          weightLbs: parseFloat(weightLbs),
          rateCents: rateCentsValue,
          pieces: pieces ? parseInt(pieces, 10) : undefined,
          specialRequirements: specialRequirements || undefined,
          referenceNumber: referenceNumber || undefined,
          scheduleType,
          scheduleDays: scheduleType === 'weekly' ? scheduleDays : undefined,
          autoCreate,
          effectiveFrom: effectiveFrom || undefined,
          effectiveUntil: effectiveUntil || undefined,
          stops: stopsData,
        });
      }
      onOpenChange(false);
    } catch {
      // Hooks already show error toasts via onError
    }
  }, [
    name,
    customerId,
    customerName,
    commodityType,
    weightLbs,
    rateDollars,
    equipmentType,
    pieces,
    specialRequirements,
    referenceNumber,
    scheduleType,
    scheduleDays,
    autoCreate,
    effectiveFrom,
    effectiveUntil,
    stops,
    isEditing,
    editLane,
    createLane,
    updateLane,
    onOpenChange,
  ]);

  const isPending = createLane.isPending || updateLane.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 gap-0 flex flex-col overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
          }
        }}
        pinnable
        resizable
        defaultPinned
      >
        <div className="px-6 pt-6 pb-2">
          <SheetHeader className="pr-12">
            <SheetTitle>{isEditing ? 'Edit Lane' : 'Create Recurring Lane'}</SheetTitle>
          </SheetHeader>
          <SheetKeyboardHint />
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Basic Info</h3>
              <div className="space-y-2">
                <Label htmlFor="lane-name">Lane Name *</Label>
                <Input
                  id="lane-name"
                  placeholder="e.g., Walmart Weekly Dallas-Houston"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Customer *</Label>
                <CustomerPicker
                  value={customerId}
                  onChange={(id, name) => {
                    setCustomerId(id);
                    setCustomerName(name);
                  }}
                />
              </div>
            </div>

            <Separator />

            {/* Load Template */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Load Template</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Equipment Type</Label>
                  <Select value={equipmentType} onValueChange={setEquipmentType}>
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
                  <Label htmlFor="commodity">Commodity *</Label>
                  <Input
                    id="commodity"
                    placeholder="General Freight"
                    value={commodityType}
                    onChange={(e) => setCommodityType(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Weight (lbs) *</Label>
                  <Input
                    id="weight"
                    type="number"
                    min="0"
                    max="200000"
                    placeholder="42000"
                    value={weightLbs}
                    onChange={(e) => setWeightLbs(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rate">Rate ($)</Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="999999.99"
                    placeholder="2500.00"
                    value={rateDollars}
                    onChange={(e) => setRateDollars(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pieces">Pieces</Label>
                  <Input
                    id="pieces"
                    type="number"
                    min="0"
                    max="99999"
                    placeholder="26"
                    value={pieces}
                    onChange={(e) => setPieces(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ref">Reference #</Label>
                  <Input
                    id="ref"
                    placeholder="PO-12345"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="special">Special Requirements</Label>
                <Textarea
                  id="special"
                  placeholder="Any special handling instructions..."
                  value={specialRequirements}
                  onChange={(e) => setSpecialRequirements(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <Separator />

            {/* Route — Collapsible Stops (matches loads pattern) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Route</h4>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addStop}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Stop
                </Button>
              </div>

              <div className="relative">
                {/* Vertical connector line */}
                {stops.length > 1 && (
                  <div className="absolute left-[1.2rem] top-[1.5rem] bottom-[1.5rem] w-px bg-border z-0" />
                )}

                <div className="space-y-1.5 relative z-10">
                  {stops.map((stop, index) => {
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

                          {/* Stop summary — inline */}
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
                            {stops.length > 2 && (
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
                            {/* Location picker */}
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
            </div>

            <Separator />

            {/* Schedule */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Schedule</h3>
              <div className="space-y-2">
                <Label>Schedule Type</Label>
                <Select value={scheduleType} onValueChange={setScheduleType}>
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
              {scheduleType === 'weekly' && (
                <div className="space-y-2">
                  <Label>Days of Week</Label>
                  <div className="flex gap-1">
                    {DAY_LABELS.map((day) => (
                      <Button
                        key={day.value}
                        variant={scheduleDays.includes(day.value) ? 'default' : 'outline'}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="effective-from">Effective From</Label>
                  <Input
                    id="effective-from"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="effective-until">Effective Until</Label>
                  <Input
                    id="effective-until"
                    type="date"
                    value={effectiveUntil}
                    onChange={(e) => setEffectiveUntil(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Auto-Create */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Auto-Create</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground">Auto-create loads</p>
                  <p className="text-xs text-muted-foreground">Automatically generate loads on schedule</p>
                </div>
                <Switch checked={autoCreate} onCheckedChange={setAutoCreate} />
              </div>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 z-10 bg-background border-t border-border px-6 py-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit} loading={isPending}>
            {isEditing ? 'Update Lane' : 'Create Lane'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
