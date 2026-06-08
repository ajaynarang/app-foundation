'use client';

import type { SettlementSummaryCardData } from '../../engine/types';
import { formatCents } from './card-utils';

export function SettlementSummaryCard({ data }: { data: Record<string, unknown> }) {
  const summary = data as unknown as SettlementSummaryCardData;
  const counts = summary.countByStatus ?? {};

  const statBoxes = [
    { label: 'Pending', cents: summary.pendingTotalCents, statusKey: 'DRAFT' },
    { label: 'Approved', cents: summary.approvedTotalCents, statusKey: 'APPROVED' },
    { label: 'Paid', cents: summary.paidTotalCents, statusKey: 'PAID' },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Title */}
      <p className="text-sm font-medium text-foreground">Settlement Summary</p>

      {/* Three stat boxes */}
      <div className="grid grid-cols-3 gap-2">
        {statBoxes.map((box) => (
          <div key={box.label} className="rounded-md bg-muted p-2.5 text-center space-y-0.5">
            <p className="text-2xs text-muted-foreground">{box.label}</p>
            <p className="text-sm font-semibold text-foreground">{formatCents(box.cents)}</p>
            {counts[box.statusKey] != null && (
              <p className="text-2xs text-muted-foreground">
                {counts[box.statusKey]} settlement
                {counts[box.statusKey] !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Additional status counts (beyond DRAFT/APPROVED/PAID) */}
      {Object.keys(counts).some((k) => !['DRAFT', 'APPROVED', 'PAID'].includes(k)) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-border">
          {Object.entries(counts)
            .filter(([status]) => !['DRAFT', 'APPROVED', 'PAID'].includes(status))
            .map(([status, count]) => (
              <span key={status} className="text-2xs text-muted-foreground">
                {status}: <span className="font-medium text-foreground">{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
