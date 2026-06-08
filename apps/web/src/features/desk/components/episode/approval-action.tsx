'use client';

import { Textarea } from '@/shared/components/ui/textarea';

import type { ApprovalArtifact, ApprovalRecord } from '../../types';

import { ArtifactRenderer } from '../approvals/artifacts/artifact-renderer';

interface ApprovalActionProps {
  pending: ApprovalRecord;
  editMode: boolean;
  isDirty: boolean;
  effectiveArtifact: ApprovalArtifact | null;
  onArtifactChange: (next: ApprovalArtifact) => void;
  onDiscardEdits: () => void;
  rejectMode: boolean;
  rejectionReason: string;
  onRejectionReasonChange: (v: string) => void;
}

/**
 * Renders the decision body inside the episode sheet. Footer buttons live
 * on the FormSheet shell — this component owns only the artifact + the
 * "How Sally got here" disclosure + the inline reject-reason textarea.
 */
export function ApprovalAction({
  pending,
  editMode,
  isDirty,
  effectiveArtifact,
  onArtifactChange,
  onDiscardEdits,
  rejectMode,
  rejectionReason,
  onRejectionReasonChange,
}: ApprovalActionProps) {
  return (
    <section className="rounded-lg border border-caution/40 bg-caution/5">
      <header className="border-b border-caution/30 px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Sally needs your call</p>
        {pending.sallysRead && (
          <blockquote className="mt-2 text-sm italic leading-relaxed text-foreground">
            &ldquo;{pending.sallysRead}&rdquo;
          </blockquote>
        )}
      </header>

      <div className="space-y-4 px-4 py-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {artifactLabel(effectiveArtifact)}
              {canEditArtifact(effectiveArtifact) && !editMode && (
                <span className="ml-2 text-muted-foreground/70">· click to edit</span>
              )}
            </h4>
            {isDirty && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={onDiscardEdits}
              >
                Discard changes
              </button>
            )}
          </div>

          {effectiveArtifact ? (
            <ArtifactRenderer artifact={effectiveArtifact} readOnly={!editMode} onChange={onArtifactChange} />
          ) : (
            <RawActionFallback action={pending.proposedAction} />
          )}
        </div>

        <DecisionContext context={pending.context ?? undefined} confidence={pending.confidence ?? undefined} />

        {rejectMode && (
          <div className="rounded-md border border-border bg-card p-3">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Why is this wrong? Sally will learn from it.
            </label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => onRejectionReasonChange(e.target.value)}
              rows={3}
              placeholder="A sentence or two is plenty."
            />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Context + confidence, always visible above the action buttons.
 *
 * Replaces the previous `SallyDisclosure` details drawer which also
 * carried the per-step timeline. The timeline was SRE-grade telemetry
 * that never influenced an approve/reject call on the happy path — pure
 * noise in the decision loop. Failures surface through the Handled
 * sheet's "What went wrong" banner, so no decision-time timeline is
 * needed here.
 */
function DecisionContext({ context, confidence }: { context?: string[]; confidence?: number }) {
  if ((!context || context.length === 0) && confidence == null) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3.5 py-3">
      {context && context.length > 0 && (
        <ul className="space-y-1 text-sm">
          {context.map((line, i) => (
            <li
              key={i}
              className="relative pl-4 before:absolute before:left-0 before:text-muted-foreground before:content-['•']"
            >
              {line}
            </li>
          ))}
        </ul>
      )}
      {confidence != null && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sally's confidence</span>
          <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.round(confidence * 100)}%` }} />
          </div>
          <span className="tabular-nums text-foreground">{Math.round(confidence * 100)}%</span>
        </div>
      )}
    </div>
  );
}

function RawActionFallback({ action }: { action: Record<string, unknown> }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
      {JSON.stringify(action, null, 2)}
    </pre>
  );
}

function artifactLabel(artifact: ApprovalArtifact | null): string {
  if (!artifact) return 'Proposed action';
  if (artifact.kind === 'email') return 'Email';
  if (artifact.kind === 'diff') return 'Change';
  return 'Proposed action';
}

function canEditArtifact(artifact: ApprovalArtifact | null): boolean {
  return artifact?.kind === 'email';
}
