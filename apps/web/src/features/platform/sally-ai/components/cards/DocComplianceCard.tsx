'use client';

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import type { DocComplianceCardData } from '../../engine/types';

const statusIcon: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  satisfied: { icon: CheckCircle2, color: SEMANTIC_COLORS.neutral.text },
  required: { icon: AlertTriangle, color: SEMANTIC_COLORS.caution.text },
  missing: { icon: XCircle, color: SEMANTIC_COLORS.critical.text },
  overdue: { icon: XCircle, color: SEMANTIC_COLORS.critical.text },
};

export function DocComplianceCard({ data }: { data: Record<string, unknown> }) {
  const { formatCalendarDate } = useFormatters();
  const doc = data as unknown as DocComplianceCardData;
  const score = Math.round(doc.complianceScore);

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Document Compliance</p>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-lg font-bold ${
              score >= 80
                ? SEMANTIC_COLORS.neutral.text
                : score >= 50
                  ? SEMANTIC_COLORS.caution.text
                  : SEMANTIC_COLORS.critical.text
            }`}
          >
            {score}%
          </span>
        </div>
      </div>
      {doc.hasBlockers && (
        <div
          className={`flex items-center gap-1.5 p-1.5 rounded ${SEMANTIC_COLORS.critical.bg} text-xs ${SEMANTIC_COLORS.critical.text}`}
        >
          <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Blockers found — cannot approve for billing</span>
        </div>
      )}
      <div className="space-y-1.5">
        {doc.requirements.map((req, i) => {
          const s = statusIcon[req.status.toLowerCase()] ?? statusIcon.required;
          const Icon = s.icon;
          return (
            <div key={i} className="flex items-start gap-2 text-xs">
              <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${s.color}`} />
              <div className="min-w-0">
                <p className="font-medium text-foreground">{req.documentType}</p>
                <p className="text-muted-foreground">{req.reason}</p>
                {req.dueBy && (
                  <p className="text-muted-foreground">
                    Due: {formatCalendarDate(req.dueBy, DISPLAY_FORMATS.FRIENDLY)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
