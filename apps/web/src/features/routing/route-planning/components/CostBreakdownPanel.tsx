'use client';

import type { CostBreakdown } from '../types';

interface CostBreakdownPanelProps {
  costBreakdown: CostBreakdown;
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

export function CostBreakdownPanel({ costBreakdown }: CostBreakdownPanelProps) {
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // Tolls: a 0 with NOT_AVAILABLE source means no toll feed is connected — say so,
  // don't imply the route is toll-free.
  const tollNotAvailable = costBreakdown.tollSource === 'NOT_AVAILABLE';
  const tollValue = tollNotAvailable ? 'Not included' : costBreakdown.tollCost > 0 ? fmt(costBreakdown.tollCost) : '—';

  return (
    <div className="bg-muted/30 rounded-md px-4 py-3 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
      <CostRow label="Fuel" value={`~${fmt(costBreakdown.fuelCost)}`} />
      <CostRow label="Labor" value={`~${fmt(costBreakdown.laborCost)}`} />
      <CostRow label="Tolls" value={tollValue} />
      <div className="border-t border-border my-1.5" />
      <div className="flex justify-between text-xs">
        <span className="font-medium text-foreground">Total</span>
        <span className="font-mono font-semibold text-foreground">~{fmt(costBreakdown.totalOperatingCost)}</span>
      </div>
      <div className="text-2xs text-muted-foreground mt-2 pt-1">
        Fuel price approximate. Labor = company cost.
        {tollNotAvailable && ' Tolls not included — connect a toll provider for toll costs.'}
      </div>
    </div>
  );
}
