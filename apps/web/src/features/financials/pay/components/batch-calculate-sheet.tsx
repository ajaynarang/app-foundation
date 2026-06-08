'use client';

import { useState, useMemo, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Button } from '@sally/ui/components/ui/button';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Separator } from '@sally/ui/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { usePreviewBatch, useBatchCalculate } from '../hooks/use-settlements';
import { formatCents } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { Input } from '@sally/ui/components/ui/input';
import { AlertTriangle, Calculator, Search } from 'lucide-react';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { PayStructureSheet } from './pay-structure-sheet';

interface BatchCalculateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodStart: string;
  periodEnd: string;
}

export function BatchCalculateSheet({ open, onOpenChange, periodStart, periodEnd }: BatchCalculateSheetProps) {
  const { formatCalendarDate } = useFormatters();
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [psDriver, setPsDriver] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: preview, isLoading } = usePreviewBatch({ periodStart, periodEnd }, open);
  const batchCalculate = useBatchCalculate();

  const previewDrivers = preview?.drivers;
  const drivers = useMemo(() => previewDrivers ?? [], [previewDrivers]);
  const eligibleDrivers = useMemo(() => drivers.filter((d) => d.eligible), [drivers]);
  const ineligibleCount = drivers.length - eligibleDrivers.length;

  const filteredDrivers = useMemo(() => {
    if (!searchQuery.trim()) return drivers;
    const q = searchQuery.toLowerCase();
    return drivers.filter((d) => d.name.toLowerCase().includes(q));
  }, [drivers, searchQuery]);

  // Auto-select eligible drivers on load
  useEffect(() => {
    if (preview?.drivers) {
      setSelectedDriverIds(new Set(preview.drivers.filter((d) => d.eligible).map((d) => d.driverId)));
    }
  }, [preview]);

  const allEligibleSelected =
    eligibleDrivers.length > 0 && eligibleDrivers.every((d) => selectedDriverIds.has(d.driverId));

  const someSelected = eligibleDrivers.some((d) => selectedDriverIds.has(d.driverId)) && !allEligibleSelected;

  const toggleDriver = (driverId: string) => {
    setSelectedDriverIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (allEligibleSelected) {
      setSelectedDriverIds(new Set());
    } else {
      setSelectedDriverIds(new Set(eligibleDrivers.map((d) => d.driverId)));
    }
  };

  const selectedTotal = useMemo(() => {
    return drivers.filter((d) => selectedDriverIds.has(d.driverId)).reduce((sum, d) => sum + d.estimatedPayCents, 0);
  }, [drivers, selectedDriverIds]);

  const handleSubmit = () => {
    const driverIds = Array.from(selectedDriverIds);
    if (driverIds.length === 0) return;
    batchCalculate.mutate({ driverIds, periodStart, periodEnd }, { onSuccess: () => onOpenChange(false) });
  };

  return (
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
          <SheetTitle className="text-foreground">Run Settlements</SheetTitle>
          <p className="text-sm text-muted-foreground">
            Period: {formatCalendarDate(periodStart, DISPLAY_FORMATS.FRIENDLY)} &ndash;{' '}
            {formatCalendarDate(periodEnd, DISPLAY_FORMATS.FRIENDLY)}
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : drivers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No active drivers found.</div>
          ) : (
            <>
              {ineligibleCount > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {ineligibleCount} driver{ineligibleCount !== 1 ? 's' : ''} ineligible for this period (no loads or
                    no pay structure).
                  </AlertDescription>
                </Alert>
              )}

              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search drivers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {allEligibleSelected ? 'Deselect All' : 'Select All'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedDriverIds.size} of {eligibleDrivers.length} eligible selected
                </span>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allEligibleSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={toggleAll}
                          aria-label="Select all eligible drivers"
                        />
                      </TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead className="hidden sm:table-cell">Pay Type</TableHead>
                      <TableHead className="hidden sm:table-cell">Rate</TableHead>
                      <TableHead className="text-right">Loads</TableHead>
                      <TableHead className="text-right">Est. Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDrivers.map((d) => (
                      <TableRow key={d.driverId} className={!d.eligible ? 'opacity-50' : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDriverIds.has(d.driverId)}
                            onCheckedChange={() => toggleDriver(d.driverId)}
                            disabled={!d.eligible}
                            aria-label={`Select ${d.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="text-foreground font-medium">{d.name}</div>
                          {d.warning && (
                            <div className={`text-xs ${SEMANTIC_COLORS.caution.text} flex items-center gap-1 mt-0.5`}>
                              <AlertTriangle className="h-3 w-3" />
                              {d.warning}
                              {d.warning.toLowerCase().includes('no pay structure') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-0 text-xs underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPsDriver({ id: d.driverId, name: d.name });
                                  }}
                                >
                                  Configure
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">
                          {d.payType?.replace(/_/g, ' ') ?? '—'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground">{d.rate ?? '—'}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{d.loadCount}</TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {d.estimatedPayCents > 0 ? formatCents(d.estimatedPayCents) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {selectedDriverIds.size} driver{selectedDriverIds.size !== 1 ? 's' : ''} selected
                </span>
                <span className="font-semibold text-foreground">Estimated Total: {formatCents(selectedTotal)}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  loading={batchCalculate.isPending}
                  disabled={selectedDriverIds.size === 0}
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  Calculate {selectedDriverIds.size} Settlement
                  {selectedDriverIds.size !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
      {psDriver && (
        <PayStructureSheet
          driverId={psDriver.id}
          driverName={psDriver.name}
          open={!!psDriver}
          onOpenChange={(open) => {
            if (!open) setPsDriver(null);
          }}
        />
      )}
    </Sheet>
  );
}
