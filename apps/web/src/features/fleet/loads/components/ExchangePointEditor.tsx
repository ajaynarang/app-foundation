'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';

import { cn } from '@sally/ui';
import { X, Plus, ArrowDownUp, MapPin } from 'lucide-react';
import type { LoadStop } from '../types';
import { StopLocationPicker, type SelectedStop } from '@/features/fleet/stops/components/StopLocationPicker';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A new exchange point to be inserted between two stops */
export interface ExchangePointDraft {
  /** Temp ID for tracking in the UI */
  tempId: string;
  /** Insert after this stop index (0-based in sorted stop list) */
  afterStopIndex: number;
  /** Location fields — full resolved stop so downstream doesn't re-resolve */
  name: string;
  city: string;
  state: string;
  /** Persisted Stop row id (when the picker resolved an existing/just-created stop) */
  stopRowId?: number;
  /** Public business id from the Stop row (e.g. STOP-xxxx) */
  stopBusinessId?: string;
  address?: string;
  zipCode?: string;
  lat?: number;
  lon?: number;
}

interface ExchangePointEditorProps {
  /** Ordered stops of the load (pickup, delivery, exchange) */
  stops: LoadStop[];
  /** Currently selected exchange stop IDs (for stops already saved as exchange) */
  existingExchangeStopIds: number[];
  /** Existing stop IDs marked as leg boundaries (Pattern B: stop-as-exchange) */
  markedStopIds: number[];
  /** New exchange points being added (not yet saved) — Pattern A: dedicated handoff */
  draftExchangePoints: ExchangePointDraft[];
  /** Callback when draft exchange points change */
  onDraftExchangePointsChange: (drafts: ExchangePointDraft[]) => void;
  /** Callback when marked stop IDs change (existing stops used as exchange) */
  onMarkedStopIdsChange: (stopIds: number[]) => void;
  /** Callback to remove an existing exchange stop (revert to delivery) */
  onRemoveExistingExchange?: (stopId: number) => void;
  /** Disable editing */
  disabled?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stopLabel(stop: LoadStop): string {
  const parts: string[] = [];
  if (stop.stopName) parts.push(stop.stopName);
  if (stop.stopCity && stop.stopState) {
    parts.push(`${stop.stopCity}, ${stop.stopState}`);
  } else if (stop.stopCity) {
    parts.push(stop.stopCity);
  }
  return parts.length > 0 ? parts.join(' — ') : `Stop #${stop.sequenceOrder + 1}`;
}

function actionBadge(actionType: string) {
  switch (actionType) {
    case 'pickup':
      return (
        <Badge variant="outline" className="text-2xs bg-blue-500/10 text-blue-500 border-blue-500/30">
          Pickup
        </Badge>
      );
    case 'delivery':
      return (
        <Badge variant="outline" className="text-2xs bg-green-500/10 text-green-500 border-green-500/30">
          Delivery
        </Badge>
      );
    case 'exchange':
      return (
        <Badge
          variant="outline"
          className="text-2xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
        >
          Exchange
        </Badge>
      );
    case 'both':
      return (
        <Badge variant="outline" className="text-2xs bg-purple-500/10 text-purple-500 border-purple-500/30">
          P &amp; D
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-2xs">
          {actionType}
        </Badge>
      );
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * ExchangePointEditor — lets dispatchers add relay handoff points between stops.
 *
 * Exchange points are locations (truck stops, rest areas, parking lots) where
 * one driver drops the trailer and another driver picks it up. The freight
 * stays on the trailer — it's a driver swap, not an unload.
 *
 * Works on any load with 2+ stops, including simple pickup → delivery.
 */
export function ExchangePointEditor({
  stops,
  existingExchangeStopIds,
  markedStopIds,
  draftExchangePoints,
  onDraftExchangePointsChange,
  onMarkedStopIdsChange,
  onRemoveExistingExchange,
  disabled = false,
}: ExchangePointEditorProps) {
  const [addingAfterIndex, setAddingAfterIndex] = useState<number | null>(null);

  const sortedStops = useMemo(() => [...stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder), [stops]);

  const existingExchangeSet = useMemo(() => new Set(existingExchangeStopIds), [existingExchangeStopIds]);
  const markedStopSet = useMemo(() => new Set(markedStopIds), [markedStopIds]);

  // Count total exchange points (existing saved + marked stops + draft new locations)
  const totalExchanges = existingExchangeStopIds.length + markedStopIds.length + draftExchangePoints.length;
  const _totalLegs = totalExchanges + 1;

  // Build the visual list: interleave stops with draft exchange points
  const visualItems = useMemo(() => {
    const items: Array<
      | { type: 'stop'; stop: LoadStop; index: number }
      | { type: 'exchange_existing'; stop: LoadStop }
      | { type: 'exchange_draft'; draft: ExchangePointDraft }
      | { type: 'stop_marked_exchange'; stop: LoadStop; index: number }
    > = [];

    for (let i = 0; i < sortedStops.length; i++) {
      const stop = sortedStops[i];

      if (existingExchangeSet.has(stop.id)) {
        // Pattern A: stop already has actionType='exchange' (saved dedicated handoff)
        items.push({ type: 'exchange_existing', stop });
      } else if (markedStopSet.has(stop.id)) {
        // Pattern B: existing customer stop marked as leg boundary
        items.push({ type: 'stop_marked_exchange', stop, index: i });
      } else {
        items.push({ type: 'stop', stop, index: i });
      }

      // Insert any draft exchange points that go after this stop index
      const draftsHere = draftExchangePoints
        .filter((d) => d.afterStopIndex === i)
        .sort((a, b) => a.tempId.localeCompare(b.tempId));
      for (const draft of draftsHere) {
        items.push({ type: 'exchange_draft', draft });
      }
    }

    return items;
  }, [sortedStops, existingExchangeSet, markedStopSet, draftExchangePoints]);

  // Compute leg numbers for visual items
  const legNumbers = useMemo(() => {
    const nums: number[] = [];
    let leg = 1;
    for (const item of visualItems) {
      nums.push(leg);
      if (item.type === 'exchange_existing' || item.type === 'exchange_draft' || item.type === 'stop_marked_exchange') {
        leg++;
      }
    }
    return nums;
  }, [visualItems]);

  const handleAddDraft = useCallback((afterStopIndex: number) => {
    setAddingAfterIndex(afterStopIndex);
  }, []);

  const handleSaveDraft = useCallback(
    (afterStopIndex: number, selected: SelectedStop) => {
      const draft: ExchangePointDraft = {
        tempId: `exchange-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        afterStopIndex,
        name: selected.name || `Exchange Point`,
        city: selected.city ?? '',
        state: selected.state ?? '',
        stopRowId: selected.id,
        stopBusinessId: selected.stopId,
        address: selected.address,
        zipCode: selected.zipCode,
        lat: selected.lat,
        lon: selected.lon,
      };
      onDraftExchangePointsChange([...draftExchangePoints, draft]);
      setAddingAfterIndex(null);
    },
    [draftExchangePoints, onDraftExchangePointsChange],
  );

  const handleRemoveDraft = useCallback(
    (tempId: string) => {
      onDraftExchangePointsChange(draftExchangePoints.filter((d) => d.tempId !== tempId));
    },
    [draftExchangePoints, onDraftExchangePointsChange],
  );

  // Pattern B: mark/unmark an existing stop as exchange boundary
  const handleMarkStop = useCallback(
    (stopId: number) => {
      onMarkedStopIdsChange([...markedStopIds, stopId]);
    },
    [markedStopIds, onMarkedStopIdsChange],
  );

  const handleUnmarkStop = useCallback(
    (stopId: number) => {
      onMarkedStopIdsChange(markedStopIds.filter((id) => id !== stopId));
    },
    [markedStopIds, onMarkedStopIdsChange],
  );

  // Can a stop be marked as exchange? Must be middle stop (not first/last)
  const canMarkAsExchange = useCallback(
    (stopIndex: number) => {
      if (disabled) return false;
      if (stopIndex === 0 || stopIndex === sortedStops.length - 1) return false;
      const stop = sortedStops[stopIndex];
      if (!stop) return false;
      // Already marked or already an exchange type
      if (markedStopSet.has(stop.id) || existingExchangeSet.has(stop.id)) return false;
      return true;
    },
    [disabled, sortedStops, markedStopSet, existingExchangeSet],
  );

  if (sortedStops.length < 2) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        At least two stops are required to configure relay exchange points.
      </div>
    );
  }

  let currentLeg = 1;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Exchange Points</span>
      </div>

      {/* Visual route with stops and exchange points */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {visualItems.map((item, vIdx) => {
          const legNum = legNumbers[vIdx];
          const isNewLeg = vIdx === 0 || legNum !== legNumbers[vIdx - 1];

          if (item.type === 'exchange_existing') {
            currentLeg++;
            return (
              <div key={`ex-${item.stop.id}`}>
                {/* Exchange divider */}
                <div className="relative flex items-center px-4 py-2 bg-yellow-500/5 dark:bg-yellow-500/10">
                  <div className="absolute inset-x-0 top-0 border-t border-dashed border-yellow-500/40" />
                  <div className="absolute inset-x-0 bottom-0 border-b border-dashed border-yellow-500/40" />
                  <MapPin className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0" />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge
                      variant="outline"
                      className="text-2xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 flex-shrink-0"
                    >
                      EXCHANGE
                    </Badge>
                    <span className="text-xs text-foreground truncate">{stopLabel(item.stop)}</span>
                    <span className="text-2xs text-muted-foreground flex-shrink-0">Driver swap</span>
                  </div>
                  {!disabled && onRemoveExistingExchange && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-yellow-500/10"
                      onClick={() => onRemoveExistingExchange(item.stop.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {/* Leg label */}
                <div className="px-4 py-1.5 bg-muted/30">
                  <Badge variant="outline" className="text-2xs bg-purple-500/10 text-purple-500 border-purple-500/30">
                    LEG {currentLeg}
                  </Badge>
                </div>
              </div>
            );
          }

          if (item.type === 'exchange_draft') {
            currentLeg++;
            return (
              <div key={item.draft.tempId}>
                {/* Draft exchange divider */}
                <div className="relative flex items-center px-4 py-2 bg-yellow-500/5 dark:bg-yellow-500/10">
                  <div className="absolute inset-x-0 top-0 border-t border-dashed border-yellow-500/40" />
                  <div className="absolute inset-x-0 bottom-0 border-b border-dashed border-yellow-500/40" />
                  <MapPin className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0" />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Badge
                      variant="outline"
                      className="text-2xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 flex-shrink-0"
                    >
                      EXCHANGE
                    </Badge>
                    <span className="text-xs text-foreground truncate">
                      {item.draft.name}
                      {item.draft.city ? ` — ${item.draft.city}, ${item.draft.state}` : ''}
                    </span>
                    <Badge variant="outline" className="text-2xs border-dashed">
                      new
                    </Badge>
                  </div>
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-yellow-500/10"
                      onClick={() => handleRemoveDraft(item.draft.tempId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {/* Leg label */}
                <div className="px-4 py-1.5 bg-muted/30">
                  <Badge variant="outline" className="text-2xs bg-purple-500/10 text-purple-500 border-purple-500/30">
                    LEG {currentLeg}
                  </Badge>
                </div>
              </div>
            );
          }

          // Pattern B: existing stop marked as exchange boundary
          if (item.type === 'stop_marked_exchange') {
            const markedStop = item.stop;
            const markedIndex = item.index;
            currentLeg++;
            return (
              <div key={`marked-${markedStop.id}`}>
                {/* Stop + exchange badge combined */}
                <div className="relative flex items-center px-4 py-2.5 bg-yellow-500/5 dark:bg-yellow-500/10">
                  <div className="absolute inset-x-0 top-0 border-t border-dashed border-yellow-500/40" />
                  <div className="absolute inset-x-0 bottom-0 border-b border-dashed border-yellow-500/40" />
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center mr-3">
                    <span className="text-2xs font-medium text-yellow-600 dark:text-yellow-400">{markedIndex + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{stopLabel(markedStop)}</p>
                      {actionBadge(markedStop.actionType)}
                      <Badge
                        variant="outline"
                        className="text-2xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 flex-shrink-0"
                      >
                        + EXCHANGE
                      </Badge>
                    </div>
                    <p className="text-2xs text-yellow-600/70 dark:text-yellow-400/70 mt-0.5">
                      Driver swap at this stop — deliver here, next driver picks up
                    </p>
                  </div>
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-yellow-500/10"
                      onClick={() => handleUnmarkStop(markedStop.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {/* Leg label */}
                <div className="px-4 py-1.5 bg-muted/30">
                  <Badge variant="outline" className="text-2xs bg-purple-500/10 text-purple-500 border-purple-500/30">
                    LEG {currentLeg}
                  </Badge>
                </div>

                {/* Add Exchange Point after this marked stop (between it and next stop) */}
                {markedIndex < sortedStops.length - 1 && !disabled && (
                  <div className="flex justify-center py-1.5 border-b border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-yellow-600 dark:hover:text-yellow-400 hover:bg-yellow-500/10"
                      onClick={() => handleAddDraft(markedIndex)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Exchange Point
                    </Button>
                  </div>
                )}
              </div>
            );
          }

          // Regular stop
          const stop = item.stop;
          const stopIndex = item.index;
          const isLast = stopIndex === sortedStops.length - 1;
          const _isFirst = stopIndex === 0;
          const canMark = canMarkAsExchange(stopIndex);

          // Don't show leg label if previous item already rendered one (marked exchange or draft/existing exchange)
          const prevItem = vIdx > 0 ? visualItems[vIdx - 1] : null;
          const prevRenderedLegLabel =
            prevItem?.type === 'stop_marked_exchange' ||
            prevItem?.type === 'exchange_existing' ||
            prevItem?.type === 'exchange_draft';

          return (
            <div key={stop.id}>
              {/* Leg label at start of each leg (skip if previous exchange item already rendered it) */}
              {isNewLeg && !prevRenderedLegLabel && (
                <div className="px-4 py-1.5 bg-muted/30">
                  <Badge variant="outline" className="text-2xs bg-purple-500/10 text-purple-500 border-purple-500/30">
                    LEG {legNum}
                  </Badge>
                </div>
              )}

              {/* Stop row */}
              <div className={cn('flex items-center gap-3 px-4 py-2.5', !isLast && 'border-b border-border')}>
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-2xs font-medium text-muted-foreground">{stopIndex + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{stopLabel(stop)}</p>
                </div>
                {actionBadge(stop.actionType)}
                {/* "Use as exchange" button on eligible middle stops */}
                {canMark && !disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-2xs px-2 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10"
                    onClick={() => handleMarkStop(stop.id)}
                  >
                    Use as exchange
                  </Button>
                )}
              </div>

              {/* Add Exchange Point button — hide if next item is already an exchange boundary */}
              {(() => {
                if (isLast || disabled || addingAfterIndex === stopIndex) return null;
                // Check if the next visual item is already an exchange (no need to add another adjacent one)
                const nextVItem = visualItems[vIdx + 1];
                if (
                  nextVItem &&
                  (nextVItem.type === 'stop_marked_exchange' ||
                    nextVItem.type === 'exchange_existing' ||
                    nextVItem.type === 'exchange_draft')
                )
                  return null;
                return (
                  <div className="flex justify-center py-1.5 border-b border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground hover:text-yellow-600 dark:hover:text-yellow-400 hover:bg-yellow-500/10"
                      onClick={() => handleAddDraft(stopIndex)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Exchange Point
                    </Button>
                  </div>
                );
              })()}

              {/* Inline exchange point form */}
              {!isLast && addingAfterIndex === stopIndex && (
                <div className="border-b border-border">
                  <InlineExchangeForm
                    onSave={(selected) => handleSaveDraft(stopIndex, selected)}
                    onCancel={() => setAddingAfterIndex(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Help text */}
      {totalExchanges === 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          Click <strong>+ Add Exchange Point</strong> between stops to insert a handoff location (truck stop, rest area)
          where drivers swap the trailer.
          {sortedStops.length > 2 && (
            <>
              <br />
              Or click <strong>Use as exchange</strong> on a middle stop to use an existing delivery/pickup as the
              driver swap point.
            </>
          )}
        </p>
      )}

      {/* Scope subnote — always visible so users know what this editor manages. */}
      <p className="text-2xs text-muted-foreground mt-2 italic">
        Note: this editor only manages driver-exchange points. To edit pickup or delivery stops, use the Stops section
        above.
      </p>
    </div>
  );
}

// ─── Inline Form ─────────────────────────────────────────────────────────────

function InlineExchangeForm({ onSave, onCancel }: { onSave: (selected: SelectedStop) => void; onCancel: () => void }) {
  const [selected, setSelected] = useState<SelectedStop | null>(null);

  // A resolved location is anything the picker actually picked — either a persisted
  // Stop (has an id) OR a geocoded suggestion (has lat/lon) OR at minimum a city/name.
  // POI suggestions like truck stops often return no city in HERE Autosuggest, so
  // gating on city alone wrongly disables the button.
  const canSave =
    !!selected &&
    (selected.id != null ||
      (selected.lat != null && selected.lon != null) ||
      (selected.city != null && selected.city.trim().length > 0));

  return (
    <div className="px-4 py-3 bg-yellow-500/5 dark:bg-yellow-500/10 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <MapPin className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
        <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">
          New Exchange Point — search for a truck stop, rest area, or any location
        </span>
      </div>
      <StopLocationPicker value={selected} onChange={(stop) => setSelected(stop)} />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          disabled={!canSave}
          onClick={() => selected && onSave(selected)}
        >
          Add Exchange
        </Button>
      </div>
    </div>
  );
}
