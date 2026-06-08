'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Slider } from '@sally/ui/components/ui/slider';
import { Separator } from '@sally/ui/components/ui/separator';
import { cn } from '@sally/ui';
import type { GenerateRouteParams } from '@/features/routing/smart-assign';
import { isoToLocalInputFormat, type DepartureSuggestion } from '../lib/derive-departure';

interface Props {
  params: GenerateRouteParams;
  onChange: (params: Partial<GenerateRouteParams>) => void;
  departureSuggestion?: DepartureSuggestion;
}

type Priority = GenerateRouteParams['optimizationPriority'];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'minimize_time', label: 'Fastest' },
  { value: 'balance', label: 'Balanced' },
  { value: 'minimize_cost', label: 'Cheapest' },
];

const REST_OPTIONS = [
  { value: 'auto', label: 'Auto (default)' },
  { value: 'full', label: 'Full rest' },
  { value: 'split_8_2', label: 'Split 8+2' },
  { value: 'split_7_3', label: 'Split 7+3' },
];

const SUGGESTION_THRESHOLD_MS = 5 * 60 * 1000;

function formatLocalDateTime(localInput: string): string {
  if (!localInput) return '';
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return localInput;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function RouteOptionsPanel({ params, onChange, departureSuggestion }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Suggestion-note logic: show the suggestion inline when the dispatcher typed a time
  // earlier than the derived suggestion by more than 5 minutes.
  const suggestedLocal = departureSuggestion ? isoToLocalInputFormat(departureSuggestion.isoTime) : null;
  const userMs = params.departureTime ? new Date(params.departureTime).getTime() : NaN;
  const suggestedMs = suggestedLocal ? new Date(suggestedLocal).getTime() : NaN;
  const showSuggestionNote =
    departureSuggestion?.source === 'DERIVED' &&
    Number.isFinite(userMs) &&
    Number.isFinite(suggestedMs) &&
    suggestedMs - userMs > SUGGESTION_THRESHOLD_MS;

  const isSuggestedValue =
    departureSuggestion?.source === 'DERIVED' &&
    suggestedLocal != null &&
    Math.abs(userMs - suggestedMs) <= SUGGESTION_THRESHOLD_MS;

  return (
    <div className="space-y-3">
      <p className="text-2xs uppercase tracking-wider font-medium text-muted-foreground">Route Options</p>

      {/* Departure — collapsed summary, expand under Advanced */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground">Departure</span>
          <span className="font-medium text-foreground truncate">
            {formatLocalDateTime(params.departureTime) || '—'}
          </span>
          {isSuggestedValue && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Suggested
            </span>
          )}
        </div>
      </div>

      {/* Priority chips */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Priority</Label>
        <div className="flex gap-1.5">
          {PRIORITIES.map((p) => (
            <Button
              key={p.value}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ optimizationPriority: p.value })}
              className={cn(
                'flex-1 h-8 text-xs font-medium transition-colors',
                params.optimizationPriority === p.value
                  ? 'bg-foreground text-background border-foreground hover:bg-foreground/90'
                  : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Advanced toggle (now includes departure-time override + rest/tolls/fuel) */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between h-7 text-xs text-muted-foreground px-0 hover:text-foreground hover:bg-transparent"
          onClick={() => setAdvancedOpen((prev) => !prev)}
        >
          <span>Advanced</span>
          {advancedOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>

        {advancedOpen && (
          <>
            <Separator className="mb-3" />
            <div className="space-y-3">
              {/* Departure time — editable override */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Departure time</Label>
                <Input
                  type="datetime-local"
                  value={params.departureTime}
                  onChange={(e) => onChange({ departureTime: e.target.value })}
                  className="h-8 text-sm"
                />
                {showSuggestionNote && suggestedLocal && (
                  <p className="text-2xs text-muted-foreground mt-1">
                    Suggestion: {formatLocalDateTime(suggestedLocal)}
                    {departureSuggestion?.note ? ` (${departureSuggestion.note})` : ''}
                  </p>
                )}
                {departureSuggestion && departureSuggestion.source !== 'DERIVED' && departureSuggestion.note && (
                  <p className="text-2xs text-amber-600 dark:text-amber-400 mt-1">{departureSuggestion.note}</p>
                )}
              </div>

              {/* Rest preference */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Rest preference</Label>
                <Select value={params.restPreference ?? 'auto'} onValueChange={(v) => onChange({ restPreference: v })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REST_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Avoid tolls */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="avoid-tolls"
                  checked={params.avoidTolls ?? false}
                  onCheckedChange={(checked) => onChange({ avoidTolls: checked === true })}
                />
                <Label htmlFor="avoid-tolls" className="text-xs cursor-pointer">
                  Avoid toll roads
                </Label>
              </div>

              {/* Max fuel detour */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Max fuel detour</Label>
                  <span className="text-xs font-medium text-foreground">{params.maxFuelDetourMiles ?? 5} mi</span>
                </div>
                <Slider
                  min={0}
                  max={30}
                  step={1}
                  value={[params.maxFuelDetourMiles ?? 5]}
                  onValueChange={([v]) => onChange({ maxFuelDetourMiles: v })}
                  className="w-full"
                />
                <div className="flex justify-between text-2xs text-muted-foreground">
                  <span>0 mi</span>
                  <span>30 mi</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
