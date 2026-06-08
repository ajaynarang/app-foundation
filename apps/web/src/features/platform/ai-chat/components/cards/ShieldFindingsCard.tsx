'use client';

import { Badge } from '@app/ui/components/ui/badge';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { AlertTriangle, XOctagon, Info } from 'lucide-react';
import type { ShieldFindingsCardData } from '../../engine/types';

const severityConfig: Record<string, { icon: typeof AlertTriangle; color: string; badgeClass: string }> = {
  CRITICAL: {
    icon: XOctagon,
    color: SEMANTIC_COLORS.critical.text,
    badgeClass: `${SEMANTIC_COLORS.critical.bg} ${SEMANTIC_COLORS.critical.text}`,
  },
  WARNING: {
    icon: AlertTriangle,
    color: SEMANTIC_COLORS.caution.text,
    badgeClass: `${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.text}`,
  },
  INFO: {
    icon: Info,
    color: SEMANTIC_COLORS.info.text,
    badgeClass: `${SEMANTIC_COLORS.info.bg} ${SEMANTIC_COLORS.info.text}`,
  },
};

export function ShieldFindingsCard({ data }: { data: Record<string, unknown> }) {
  const f = data as unknown as ShieldFindingsCardData;

  // Sort: CRITICAL first, then WARNING, then INFO
  const order: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  const sorted = [...f.findings].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  const shown = sorted.slice(0, 10);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Shield Findings</p>
        <Badge variant="muted" className="bg-muted text-foreground">
          {f.totalCount}
        </Badge>
      </div>
      <div className="space-y-2">
        {shown.map((finding, i) => {
          const cfg = severityConfig[finding.severity] ?? severityConfig.INFO;
          const Icon = cfg.icon;
          return (
            <div key={i} className="flex items-start gap-2 text-xs">
              <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${cfg.color}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{finding.title}</span>
                  <Badge className={cfg.badgeClass} variant="muted">
                    {finding.severity}
                  </Badge>
                </div>
                {finding.entityName && <p className="text-muted-foreground">{finding.entityName}</p>}
                {finding.recommendation && <p className="text-muted-foreground mt-0.5">{finding.recommendation}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {f.totalCount > 10 && (
        <p className="text-xs text-muted-foreground text-center">and {f.totalCount - 10} more findings...</p>
      )}
    </div>
  );
}
