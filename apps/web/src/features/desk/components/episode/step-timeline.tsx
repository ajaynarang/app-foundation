'use client';

import { cn } from '@/shared/lib/utils';
import { formatCurrency } from '@/shared/lib/utils/formatters';

import { STEP_DESCRIPTIONS, STEP_LABELS, STEP_STATUS_VARIANTS } from '../../constants';
import type { StepRecord } from '../../types';

interface StepTimelineProps {
  steps: StepRecord[];
}

/**
 * Renders the hydrate → perceive → decide → draft → gate → execute → close
 * timeline for an episode. Each step shows model/cost/confidence when
 * applicable and exposes the raw output/gate/tool-result for inspection.
 */
export function StepTimeline({ steps }: StepTimelineProps) {
  if (steps.length === 0) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-foreground">What Sally did</h3>
        <p className="mt-2 text-xs text-muted-foreground">No steps yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">What Sally did</h3>
      <ol className="mt-3 space-y-3">
        {steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </ol>
    </section>
  );
}

function StepCard({ step }: { step: StepRecord }) {
  const statusVariant = STEP_STATUS_VARIANTS[step.status];
  const hasModel = !!step.model;

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{STEP_LABELS[step.kind]}</span>
          {statusVariant && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                statusVariant.className,
              )}
            >
              {statusVariant.label}
            </span>
          )}
        </div>
        {step.durationMs != null && <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{STEP_DESCRIPTIONS[step.kind]}</p>

      {hasModel && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{step.model}</span>
          {step.confidence != null && <span>confidence {(step.confidence * 100).toFixed(0)}%</span>}
          {step.costUsd != null && <span>{formatCurrency(Math.round(Number(step.costUsd) * 100))}</span>}
        </div>
      )}

      {step.toolName && (
        <div className="mt-2 text-xs text-muted-foreground">
          tool: <span className="font-mono">{step.toolName}</span>
          {step.toolTier && ` · ${step.toolTier}`}
        </div>
      )}

      {step.gateDecision && (
        <div className="mt-2 rounded bg-muted/60 p-2 text-xs">
          <p className="font-medium text-foreground">{step.gateDecision.gated ? 'Gated' : 'Passed'}</p>
          <p className="text-muted-foreground">{step.gateDecision.rule}</p>
        </div>
      )}

      {step.errorMessage && <p className="mt-2 text-xs text-red-500">{step.errorMessage}</p>}
    </li>
  );
}
