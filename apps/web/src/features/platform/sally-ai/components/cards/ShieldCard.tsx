'use client';

import { Badge } from '@sally/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import type { ShieldCardData } from '../../engine/types';

const statusStyles: Record<string, string> = {
  PROTECTED: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  AT_RISK: `${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.text}`,
  VULNERABLE: `${SEMANTIC_COLORS.critical.bg} ${SEMANTIC_COLORS.critical.text}`,
};

function scoreColor(score: number): string {
  if (score >= 80) return SEMANTIC_COLORS.neutral.text;
  if (score >= 50) return SEMANTIC_COLORS.caution.text;
  return SEMANTIC_COLORS.critical.text;
}

export function ShieldCard({ data }: { data: Record<string, unknown> }) {
  const { formatTimestamp } = useFormatters();
  const s = data as unknown as ShieldCardData;
  const overall = Math.round(s.overallScore ?? 0);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Shield Compliance</p>
          <p className={`text-2xl font-bold ${scoreColor(overall)}`}>{overall}</p>
        </div>
        {s.statusLabel && (
          <Badge className={statusStyles[s.statusLabel] || statusStyles.AT_RISK} variant="muted">
            {s.statusLabel.replace('_', ' ')}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'HOS', score: s.hosScore },
          { label: 'Drivers', score: s.driversScore },
          { label: 'Vehicles', score: s.vehiclesScore },
          { label: 'Loads', score: s.loadsScore },
        ].map((cat) => (
          <div key={cat.label} className="p-1.5 rounded bg-muted">
            <p className={`text-sm font-bold ${scoreColor(cat.score ?? 0)}`}>{Math.round(cat.score ?? 0)}</p>
            <p className="text-2xs text-muted-foreground">{cat.label}</p>
          </div>
        ))}
      </div>
      {s.lastAuditAt && <p className="text-xs text-muted-foreground">Last audit: {formatTimestamp(s.lastAuditAt)}</p>}
    </div>
  );
}
