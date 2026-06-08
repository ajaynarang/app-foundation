'use client';

import { useMemo, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Load, RateconConfidence } from '@/features/fleet/loads/types';
import { validateReadyForConfirmation, type ConfirmationIssue } from '@sally/shared-types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';

type ConfidenceLevel = 'high' | 'medium' | 'low';

// ── Confidence Dot ──────────────────────────────────────────────────
const DOT_COLORS: Record<ConfidenceLevel, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

export function ConfidenceDot({ level, edited }: { level: ConfidenceLevel | null | undefined; edited: boolean }) {
  if (edited || !level) return null;
  if (level === 'high') {
    return (
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_COLORS.high} flex-shrink-0`}
        title="High confidence"
      />
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_COLORS[level]} flex-shrink-0 cursor-help`} />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {level === 'medium' ? 'Medium confidence — verify this field' : 'Low confidence — likely needs correction'}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Stop Confidence Helper ────────────────────────────────────────────
const LEVEL_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

/** Returns the worst confidence level across a stop's location + date fields. */
export function worstStopConfidence(
  stopConf: { location: ConfidenceLevel; date: ConfidenceLevel | null } | undefined,
): ConfidenceLevel | null {
  if (!stopConf) return null;
  const levels: ConfidenceLevel[] = [stopConf.location];
  if (stopConf.date) levels.push(stopConf.date);
  return levels.reduce((worst, l) => (LEVEL_RANK[l] < LEVEL_RANK[worst] ? l : worst));
}

// ── Validation Issues ───────────────────────────────────────────────
// Re-export for convenience — the type lives in @sally/shared-types
export type { ConfirmationIssue } from '@sally/shared-types';

/**
 * Frontend wrapper over the shared validation function.
 * Merges edit form state with load data before validating,
 * using editedFields to distinguish "not touched" from "explicitly cleared".
 */
export function getConfirmationIssues(
  load: Load,
  editForm: { customerId?: number | null; rateCents?: number; referenceNumber?: string },
  editStops: Array<{ actionType: string; city?: string; state?: string }>,
  editedFields?: Set<string>,
): ConfirmationIssue[] {
  return validateReadyForConfirmation({
    customerId: editedFields?.has('customerId') ? editForm.customerId : (editForm.customerId ?? load.customerId),
    rateCents: editedFields?.has('rateCents') ? editForm.rateCents : (editForm.rateCents ?? load.rateCents),
    referenceNumber: editedFields?.has('referenceNumber')
      ? editForm.referenceNumber
      : (editForm.referenceNumber ?? load.referenceNumber),
    stops: editStops,
  });
}

// ── Confidence Banner ───────────────────────────────────────────────
interface ConfidenceBannerProps {
  confidence: RateconConfidence | null;
  editedFields: Set<string>;
  confirmationIssues: ConfirmationIssue[];
}

export function ConfidenceBanner({ confidence, editedFields, confirmationIssues }: ConfidenceBannerProps) {
  const confidenceIssues = useMemo(() => {
    if (!confidence) return [];
    const items: Array<{ label: string; level: ConfidenceLevel }> = [];

    if (confidence.reference_number !== 'high' && !editedFields.has('referenceNumber')) {
      items.push({ label: 'Reference / PO #', level: confidence.reference_number });
    }
    if (confidence.broker_name !== 'high' && !editedFields.has('customerId')) {
      items.push({ label: 'Broker / Customer', level: confidence.broker_name });
    }
    if (confidence.rate !== 'high' && !editedFields.has('rateCents')) {
      items.push({ label: 'Rate', level: confidence.rate });
    }
    confidence.stops.forEach((s) => {
      if (s.location !== 'high' && !editedFields.has(`stop-${s.sequence}-location`)) {
        items.push({ label: `Stop ${s.sequence} address`, level: s.location });
      }
      if (s.date && s.date !== 'high' && !editedFields.has(`stop-${s.sequence}-date`)) {
        items.push({ label: `Stop ${s.sequence} date`, level: s.date });
      }
    });

    return items;
  }, [confidence, editedFields]);

  // Priority 1: Show validation issues (applies to ALL draft loads)
  if (confirmationIssues.length > 0) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-md bg-red-500/10 border border-red-500/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          <span className="text-xs font-medium text-red-500">
            {confirmationIssues.length} required field{confirmationIssues.length > 1 ? 's' : ''} missing
          </span>
        </div>
        <div className="flex flex-col gap-0.5 pl-5">
          {confirmationIssues.map((issue) => (
            <span key={issue.field} className="text-[11px] text-muted-foreground">
              • {issue.message}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Priority 2: Show confidence issues (ratecon imports only)
  if (confidenceIssues.length > 0) {
    return (
      <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-md bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="text-xs font-medium text-amber-500">
            {confidenceIssues.length} field{confidenceIssues.length > 1 ? 's' : ''} need verification
          </span>
        </div>
        <div className="flex flex-col gap-0.5 pl-5">
          {confidenceIssues.map((item) => (
            <span key={item.label} className="text-[11px] text-muted-foreground">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${DOT_COLORS[item.level]}`} />
              <strong className="text-foreground">{item.label}</strong> — {item.level} confidence
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Priority 3: All verified (ratecon imports only)
  if (confidence) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span className="text-xs font-medium text-emerald-500">All fields verified — ready to confirm</span>
      </div>
    );
  }

  return null;
}

// ── Edited Fields Tracker ───────────────────────────────────────────
export function useEditedFields() {
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());

  const markEdited = useCallback((field: string) => {
    setEditedFields((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setEditedFields(new Set());
  }, []);

  return { editedFields, markEdited, reset };
}
