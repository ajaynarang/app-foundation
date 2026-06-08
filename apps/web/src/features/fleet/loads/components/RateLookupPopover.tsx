'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, RotateCcw } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@sally/ui/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Label } from '@sally/ui/components/ui/label';
import { LaneIntelligenceCard } from './load-tabs/shared/LaneIntelligenceCard';
import { useReferenceData } from '@/features/platform/reference-data';

interface RateLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lane rate lookup — opened from the Loads ⋯ More menu as a dialog (controlled).
 * Previously a toolbar popover; moved behind ⋯ to keep the page-chrome action
 * cluster lean (Import · New Load · ⋯). See sally-frontend-patterns §15.4.
 */
export function RateLookupDialog({ open, onOpenChange }: RateLookupDialogProps) {
  const [originState, setOriginState] = useState('');
  const [destState, setDestState] = useState('');
  const [equipmentType, setEquipmentType] = useState('all');
  const [originOpen, setOriginOpen] = useState(false);
  const [destOpen, setDestOpen] = useState(false);

  const { data: refData } = useReferenceData(['us_state', 'equipment_type']);

  const states = useMemo(
    () => refData?.us_state?.map((item) => ({ code: item.code, label: item.label })) ?? [],
    [refData],
  );

  const equipmentTypes = useMemo(
    () =>
      refData?.equipment_type?.map((item) => ({
        code: item.code.toLowerCase(),
        label: item.label,
      })) ?? [],
    [refData],
  );

  const handleReset = () => {
    setOriginState('');
    setDestState('');
    setEquipmentType('all');
  };

  const hasSelection = originState || destState;
  const resolvedEquipment = equipmentType !== 'all' ? equipmentType : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* pr-8 reserves space for the dialog's built-in X (absolute right-4) so Reset doesn't collide. */}
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0 pr-8">
          <DialogTitle>Lane Rate Lookup</DialogTitle>
          {hasSelection && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-xs text-muted-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          )}
        </DialogHeader>
        <div className="space-y-3">
          {/* Origin state — searchable combobox */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Origin</Label>
            <StateCombobox
              states={states}
              value={originState}
              onChange={setOriginState}
              open={originOpen}
              onOpenChange={setOriginOpen}
              placeholder="Search state..."
            />
          </div>

          {/* Destination state — searchable combobox */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Destination</Label>
            <StateCombobox
              states={states}
              value={destState}
              onChange={setDestState}
              open={destOpen}
              onOpenChange={setDestOpen}
              placeholder="Search state..."
            />
          </div>

          {/* Equipment type (optional) */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Equipment (optional)</Label>
            <Select value={equipmentType} onValueChange={setEquipmentType}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All Equipment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Equipment</SelectItem>
                {equipmentTypes.map((eq) => (
                  <SelectItem key={eq.code} value={eq.code}>
                    {eq.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Results or hint */}
          {originState && destState ? (
            <LaneIntelligenceCard
              originState={originState}
              destState={destState}
              equipmentType={resolvedEquipment}
              compact
            />
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Select origin and destination to look up lane rates
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Searchable State Combobox ──

function StateCombobox({
  states,
  value,
  onChange,
  open,
  onOpenChange,
  placeholder,
}: {
  states: { code: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder: string;
}) {
  const selected = states.find((s) => s.code === value);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full h-8 justify-between text-sm font-normal', !selected && 'text-muted-foreground')}
        >
          <span className="truncate">{selected ? `${selected.code} — ${selected.label}` : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type state name or code..." className="h-8 text-sm" />
          <CommandList className="max-h-[200px]">
            <CommandEmpty>No state found.</CommandEmpty>
            <CommandGroup>
              {states.map((state) => (
                <CommandItem
                  key={state.code}
                  value={`${state.code} ${state.label}`}
                  onSelect={() => {
                    onChange(state.code);
                    onOpenChange(false);
                  }}
                  className="text-sm"
                >
                  <Check className={cn('mr-2 h-3.5 w-3.5', value === state.code ? 'opacity-100' : 'opacity-0')} />
                  <span className="font-medium">{state.code}</span>
                  <span className="text-muted-foreground ml-1.5">{state.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
