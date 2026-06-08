'use client';

import { useMemo, useState } from 'react';
import { BellOff, ChevronRight, Edit3, X } from 'lucide-react';
import { showError } from '@sally/ui';

import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

import { useEpisode } from '../../hooks/use-episodes';
import { useDecideApproval } from '../../hooks/use-approvals';
import { useSnoozeEpisode } from '../../hooks/use-snooze';
import { useDeskStore } from '../../store/desk-store';
import { derivePill, PILL_TONE } from '../../lib/handled-pill';
import { SNOOZE_DURATIONS } from '../../lib/snooze-durations';
import type { ApprovalArtifact, ApprovalRecord, DeskEpisodeDetail } from '../../types';

import { ApprovalAction } from './approval-action';
import { EpisodeMemoriesInfluenced } from './episode-memories-influenced';
import { HandledDecisionDiff } from './handled-decision-diff';
import { HandledSnoozeCard } from './handled-snooze-card';
import { ResolveEscalationDialog } from './resolve-escalation-dialog';
import { StepTimeline } from './step-timeline';

const TERMINAL_STATUSES: ReadonlyArray<DeskEpisodeDetail['status']> = [
  'RESOLVED',
  'REJECTED_BY_OPERATOR',
  'EXPIRED',
  'ESCALATED',
  'FAILED',
  'CANCELLED',
];

/**
 * One sheet, two modes.
 *
 *   • `NeedsYouMode` — pending approval open. Artifact + 3 canonical
 *     decision buttons in the FormSheet sticky footer (Approve · Edit &
 *     approve · Reject). Edit/reject transient state lives inside
 *     NeedsYouMode.
 *
 *   • `HandledMode` — terminal status, no pending approval. Outcome-first
 *     header (entity label + 6-state pill + closed-at + outcome), an
 *     inline diff when the human edited, an auto-open timeline, and an
 *     EpisodeMemoriesInfluenced card (driven by retrievedMemoryIds when
 *     present, else falls back to memories written from this episode).
 *     Footer is a single Close button in view mode.
 *
 * Both modes render the same FormSheet shell — only the footer and body
 * sections differ. See design spec D6.
 */
export function EpisodeSheet() {
  const selectedEpisodeId = useDeskStore((s) => s.selectedEpisodeId);
  const closeEpisode = useDeskStore((s) => s.closeEpisode);
  const { data: episode, isLoading } = useEpisode(selectedEpisodeId);

  const open = !!selectedEpisodeId;

  if (!open) {
    // Keep the tree mounted predictably — the sheet renders closed until
    // a selection exists. Skeleton covers the narrow window between
    // selectedEpisodeId updates and the detail query resolving.
    return null;
  }

  if (isLoading || !episode) {
    return (
      <FormSheet
        open
        onOpenChange={(next) => {
          if (!next) closeEpisode();
        }}
        title="Episode"
        description="Loading…"
        entityType="desk-episode"
        mode="view"
        pinnable
        resizable
      >
        <SheetSkeleton />
      </FormSheet>
    );
  }

  const pending = episode.approvals.find((a) => a.decision == null) ?? null;
  const isTerminal = TERMINAL_STATUSES.includes(episode.status);

  if (pending) {
    return <NeedsYouMode episode={episode} pending={pending} onClose={closeEpisode} />;
  }
  if (isTerminal) {
    return <HandledMode episode={episode} onClose={closeEpisode} />;
  }
  // Running / waiting_approval without a current pending row (rare):
  // fall back to the bare timeline in view mode.
  return <RunningMode episode={episode} onClose={closeEpisode} />;
}

// ─── Needs-You mode (pending approval) ─────────────────────────────────

function NeedsYouMode({
  episode,
  pending,
  onClose,
}: {
  episode: DeskEpisodeDetail;
  pending: ApprovalRecord;
  onClose: () => void;
}) {
  // Transient edit/reject state lives here so HandledMode never carries
  // it. Each mode is self-contained.
  const [editMode, setEditMode] = useState(false);
  const [editedArtifact, setEditedArtifact] = useState<ApprovalArtifact | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const decide = useDecideApproval();
  const snooze = useSnoozeEpisode();
  const effectiveArtifact = editedArtifact ?? pending.artifact ?? null;
  const isDirty = editedArtifact !== null;

  // Title strip format: `{agent} · {responsibility}`. The title strip is
  // the "who owns this kind of work" frame — persistent when the sheet
  // scrolls and only the top bar shows. The entity + outcome live in the
  // card header inside the body, so the two surfaces never duplicate.
  const title = useMemo(() => {
    const parts = [episode.ownerAgentName, episode.responsibilityTitle].filter(Boolean) as string[];
    if (parts.length > 0) return parts.join(' · ');
    return pending.decisionHeader?.title ?? episode.entityLabel ?? 'Episode';
  }, [episode.entityLabel, episode.ownerAgentName, episode.responsibilityTitle, pending.decisionHeader?.title]);

  const onApprove = () => {
    if (isDirty && effectiveArtifact) {
      decide.mutate({
        id: pending.id,
        body: { decision: 'EDITED', editedAction: serialiseArtifact(effectiveArtifact), terminate: false },
      });
      return;
    }
    decide.mutate({ id: pending.id, body: { decision: 'APPROVED', terminate: false } });
  };

  const onReject = () => {
    if (!rejectionReason.trim()) {
      showError('Reason required', 'Add a brief note so Sally can learn. Even one sentence helps.');
      return;
    }
    decide.mutate(
      {
        id: pending.id,
        body: { decision: 'REJECTED', rejectionReason: rejectionReason.trim(), terminate: true },
      },
      { onSuccess: () => setRejectMode(false) },
    );
  };

  const footerExtra = (
    <div className="flex flex-wrap gap-2">
      {!editMode && effectiveArtifact?.kind === 'email' && (
        <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
          <Edit3 className="mr-1 h-4 w-4" />
          Edit &amp; approve
        </Button>
      )}
      {!rejectMode && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" loading={snooze.isPending}>
              <BellOff className="mr-1 h-4 w-4" />
              Snooze
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SNOOZE_DURATIONS.map((d) => (
              <DropdownMenuItem
                key={d.value}
                onSelect={() => snooze.mutate({ episodeId: episode.id, body: { duration: d.value } })}
              >
                {d.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {rejectMode ? (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setRejectMode(false)} disabled={decide.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onReject}
            loading={decide.isPending}
          >
            Confirm reject
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setRejectMode(true)}
        >
          <X className="mr-1 h-4 w-4" />
          Reject
        </Button>
      )}
    </div>
  );

  // Rich title strip: entity-kind chip + priority + `{agent} · {decision}`.
  // Agent name lives inside the `title` string itself (above) so screen
  // readers get the full context; we just render chips before it visually.
  const titleNode = (
    <span className="flex items-center gap-2">
      {episode.entityType && <KindChip entityType={episode.entityType} />}
      <PriorityChip priority={episode.priority} />
      <span className="truncate">{title}</span>
    </span>
  );

  return (
    <FormSheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      titleNode={titleNode}
      entityType="desk-episode"
      mode="edit"
      onSubmit={onApprove}
      submitLabel={isDirty ? 'Approve edited' : 'Approve'}
      isSubmitting={decide.isPending}
      footerExtra={footerExtra}
      pinnable
      resizable
    >
      <div className="mt-2 space-y-4">
        <ApprovalAction
          pending={pending}
          editMode={editMode}
          isDirty={isDirty}
          effectiveArtifact={effectiveArtifact}
          onArtifactChange={setEditedArtifact}
          onDiscardEdits={() => {
            setEditedArtifact(null);
            setEditMode(false);
          }}
          rejectMode={rejectMode}
          rejectionReason={rejectionReason}
          onRejectionReasonChange={setRejectionReason}
        />
        {/* Surface the memories hydrate retrieved for this episode so
            the dispatcher can see what context shaped Sally's draft. */}
        <EpisodeMemoriesInfluenced
          episodeId={episode.id}
          agentKey={episode.ownerAgentKey}
          retrievedMemoryIds={episode.retrievedMemoryIds}
        />
      </div>
    </FormSheet>
  );
}

// ─── Handled mode (terminal, no pending) ───────────────────────────────

function HandledMode({ episode, onClose }: { episode: DeskEpisodeDetail; onClose: () => void }) {
  const decided = episode.mostRecentDecidedApproval;
  const pill = derivePill({
    humanDecision: decided?.decision ?? null,
    outcome: episode.outcome ?? '',
    activeSuppression: episode.activeSuppression,
  });

  const proposed = decided?.proposedAction as Record<string, unknown> | null | undefined;
  const edited = decided?.editedAction as Record<string, unknown> | null | undefined;
  const isEmailDiff =
    decided?.decision === 'EDITED' &&
    proposed != null &&
    edited != null &&
    typeof (proposed as { body?: unknown }).body !== 'undefined';

  // The artifact Sally actually sent — edited version for EDITED, proposed for APPROVED.
  // This is the #1 trust-calibration field: dispatcher sees what actually went out.
  const sentArtifact = decided?.decision === 'EDITED' ? edited : proposed;
  const sentEmail = isEmailRecord(sentArtifact) ? sentArtifact : null;

  // Humanize programmer-speak outcomes for the dispatcher.
  const outcomeLabel = humanizeOutcome(episode.outcome, episode.status);

  // Duration + decided-by attribution.
  const durationLabel = formatEpisodeDuration(episode.openedAt, episode.closedAt);
  const decidedBy = decided?.decidedByUserId ? 'You' : null; // TODO: join user name once wired
  const decidedWhen = decided?.decidedAt ? formatRelativeTime(decided.decidedAt) : null;

  // Failure banner for failed/cancelled episodes — surface the failed step's
  // error so the dispatcher doesn't have to scroll the timeline to find it.
  const failedStep = episode.status === 'FAILED' ? episode.steps.find((s) => s.status === 'FAILED') : null;

  // "Why Sally decided this" — prefer the decided approval's enriched
  // payload (operator-gated path), otherwise fall back to the decide step's
  // reasoning + confidence (pure autonomous path, no human in the loop).
  // Without the fallback, Autonomous-pill episodes render with an empty
  // explanation — which is the least useful moment to hide the reasoning.
  const whyContext = resolveWhyContext(episode, decided ?? null);

  // Title strip format: `{agent} · {responsibility}`. Persistent persona-
  // and-area frame when the sheet is scrolled. Entity + outcome live in
  // the card header below, so the two surfaces carry disjoint info.
  const titleParts = [episode.ownerAgentName, episode.responsibilityTitle].filter(Boolean) as string[];
  const titleStrip = titleParts.length > 0 ? titleParts.join(' · ') : (episode.entityLabel ?? 'Episode');

  // An escalation is closed-but-unfinished: it lives on Needs-you (so it opens
  // in this Handled-style sheet, since ESCALATED is terminal) and needs the
  // operator's sign-off. Surface the Resolve action only for ESCALATED.
  const isEscalation = episode.status === 'ESCALATED';

  return (
    <FormSheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={titleStrip}
      entityType="desk-episode"
      mode="view"
      footerExtra={
        <div className="flex flex-1 items-center justify-end gap-2">
          {isEscalation && <ResolveEscalationDialog episodeId={episode.id} onResolved={onClose} />}
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
      pinnable
      resizable
    >
      <div className="mt-2 space-y-4">
        {/* ─── Card header — entity + outcome + pill + meta ───
            Agent + responsibility live in the FormSheet title strip
            above; the card owns the specific entity and what happened.
            No duplication between the two surfaces. */}
        <header className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {episode.entityType && <KindChip entityType={episode.entityType} />}
                <PriorityChip priority={episode.priority} />
                <h3 className="truncate text-sm font-semibold text-foreground">{episode.entityLabel ?? episode.id}</h3>
              </div>
              <p className="mt-1 text-sm text-foreground">{outcomeLabel}</p>
            </div>
            <span className={cn('shrink-0 rounded px-2 py-0.5 text-[11px] font-medium', PILL_TONE[pill])}>{pill}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {decidedBy && decidedWhen && (
              <span>
                {decidedBy} · {decidedWhen}
              </span>
            )}
            {!decidedBy && episode.closedAt && <span>Closed {formatRelativeTime(episode.closedAt)}</span>}
            {/* Duration omitted — SRE telemetry, surfaced in the
                technical-details drawer on failures instead. */}
          </div>
        </header>

        {/* ─── Escalation surface: why Sally handed this to a human ───
            An escalation is unfinished business — make the reason the first
            thing the operator reads, above the resolve action in the footer. */}
        {isEscalation && episode.outcomeNote && (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <h4 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-destructive">
              Why Sally escalated
            </h4>
            <p className="text-xs text-foreground">{episode.outcomeNote}</p>
          </section>
        )}

        {/* ─── Failed-episode surface: show the actual error ─── */}
        {failedStep && (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <h4 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-destructive">What went wrong</h4>
            <p className="text-xs text-foreground">
              Step <span className="font-medium">{failedStep.kind}</span> failed
              {failedStep.errorMessage ? `: ${failedStep.errorMessage}` : ''}
            </p>
            {episode.outcomeNote && <p className="mt-1 text-xs text-muted-foreground">{episode.outcomeNote}</p>}
          </section>
        )}

        {/* ─── Active suppression (snooze card) ─── */}
        {episode.activeSuppression && (
          <HandledSnoozeCard
            suppressionId={episode.activeSuppression.id}
            suppressUntil={episode.activeSuppression.suppressUntil}
          />
        )}

        {/* ─── Sally's read + context + confidence — pulled from the decided
            approval OR (for autonomous closes) from the decide step's
            reasoning. Either way, this is what went into the call. ─── */}
        {whyContext && (
          <section className="rounded-lg border border-border bg-card p-4">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Why Sally decided this
            </h4>
            {whyContext.sallysRead && (
              <blockquote className="mb-2 text-sm italic leading-relaxed text-foreground">
                &ldquo;{whyContext.sallysRead}&rdquo;
              </blockquote>
            )}
            {whyContext.context && whyContext.context.length > 0 && (
              <ul className="mb-2 space-y-1 text-sm">
                {whyContext.context.map((line, i) => (
                  <li
                    key={i}
                    className="relative pl-4 before:absolute before:left-0 before:text-muted-foreground before:content-['•']"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {whyContext.confidence != null && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Confidence</span>
                <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${Math.round(whyContext.confidence * 100)}%` }} />
                </div>
                <span className="tabular-nums text-foreground">{Math.round(whyContext.confidence * 100)}%</span>
              </div>
            )}
          </section>
        )}

        {/* ─── Diff when the operator edited Sally's draft ─── */}
        {isEmailDiff && (
          <section className="rounded-lg border border-border bg-card p-4">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              What you changed
            </h4>
            <HandledDecisionDiff
              proposed={proposed as { to?: string; subject?: string; body?: string }}
              approved={edited as { to?: string; subject?: string; body?: string }}
            />
          </section>
        )}

        {/* ─── The artifact that actually went out ─── */}
        {sentEmail && (
          <section className="rounded-lg border border-border bg-card p-4">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              What Sally sent
            </h4>
            <dl className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">To</dt>
                <dd className="truncate text-foreground">{sentEmail.to ?? '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted-foreground">Subject</dt>
                <dd className="truncate text-foreground">{sentEmail.subject ?? '—'}</dd>
              </div>
            </dl>
            {sentEmail.body && (
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-xs text-foreground">
                {sentEmail.body}
              </pre>
            )}
          </section>
        )}

        {/* ─── Technical details — SRE-grade step telemetry.
            Only renders on failed/cancelled episodes where it's actually
            useful ("which step blew up and why"). Hidden on happy-path
            Approved/Edited/Autonomous closes because `hydrate 16ms /
            perceive 4.2s` carries zero trust signal there. */}
        {(failedStep != null || episode.status === 'FAILED' || episode.status === 'CANCELLED') && (
          <details className="group rounded-lg border border-border bg-card" open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm hover:bg-muted/40">
              <span className="flex items-center gap-2">
                <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Technical details
                </span>
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {episode.steps.length} step{episode.steps.length === 1 ? '' : 's'}
                {durationLabel ? ` · ${durationLabel}` : ''}
              </span>
            </summary>
            <div className="border-t border-border px-4 pb-4 pt-3">
              <StepTimeline steps={episode.steps} />
            </div>
          </details>
        )}

        {/* ─── Memories that influenced this episode (or learned from it) ─── */}
        <EpisodeMemoriesInfluenced
          episodeId={episode.id}
          agentKey={episode.ownerAgentKey}
          retrievedMemoryIds={episode.retrievedMemoryIds}
        />
      </div>
    </FormSheet>
  );
}

/**
 * Human-friendly outcome labels — the dispatcher never sees `followup_sent`
 * or `rejected_by_operator`; they see "Reminder sent" / "You rejected."
 * Falls back to a title-cased version of the raw code so new outcomes
 * still render sensibly before a label is added.
 */
function humanizeOutcome(outcome: string | null, status: DeskEpisodeDetail['status']): string {
  const LABELS: Record<string, string> = {
    followup_sent: 'Reminder sent',
    promise_recorded: 'Promise-to-pay recorded',
    no_action_needed: 'No action needed',
    escalated_to_human: 'Escalated to you',
    rejected_by_operator: 'You rejected — nothing sent',
    approval_expired: 'Expired without a decision',
    preflight_skipped: 'Skipped by preflight',
    preflight_aborted: 'Aborted by preflight',
    workflow_lost_state: 'Workflow lost state',
  };
  if (outcome && LABELS[outcome]) return LABELS[outcome];
  if (status === 'FAILED' && !outcome) return 'Sally could not complete it';
  if (status === 'CANCELLED' && !outcome) return 'Cancelled';
  if (outcome) return outcome.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return 'Completed';
}

/** Formats `openedAt → closedAt` as "1m 23s" / "4h 10m". Returns null when unclosed. */
function formatEpisodeDuration(openedAt: string, closedAt: string | null): string | null {
  if (!closedAt) return null;
  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return null;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/** Narrow the artifact record down to the email shape for the "What Sally sent" card. */
function isEmailRecord(value: unknown): value is { to?: string; subject?: string; body?: string } {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  const hasEmailField = typeof r.to === 'string' || typeof r.subject === 'string' || typeof r.body === 'string';
  return hasEmailField;
}

/** Entity-kind chip used inline with the sheet title (both modes). */
function KindChip({ entityType }: { entityType: string }) {
  return (
    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {entityType}
    </span>
  );
}

/**
 * Priority chip — surfaces HIGH/URGENT so triage stays obvious in the
 * title row. Renders nothing for LOW/NORMAL (the silent default) to
 * avoid visual noise on every episode.
 */
function PriorityChip({ priority }: { priority: DeskEpisodeDetail['priority'] }) {
  if (priority !== 'HIGH' && priority !== 'URGENT') return null;
  const tone = priority === 'URGENT' ? 'bg-destructive/15 text-destructive' : 'bg-caution/15 text-caution';
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', tone)}>
      {priority}
    </span>
  );
}

/**
 * "Why Sally decided this" content. Prefers the decided approval's
 * enriched payload (adapter already built the 1-liner + context bullets
 * + confidence at enrichment time). Falls back to the decide step's raw
 * `reasoning` + `confidence` when no approval exists (pure autonomous
 * close — no human in the loop). Returns null when nothing useful can
 * be surfaced so the card doesn't render an empty shell.
 */
function resolveWhyContext(
  episode: DeskEpisodeDetail,
  decided: ApprovalRecord | null,
): { sallysRead: string | null; context: readonly string[] | null; confidence: number | null } | null {
  if (
    decided &&
    (decided.sallysRead || (decided.context && decided.context.length > 0) || decided.confidence != null)
  ) {
    return {
      sallysRead: decided.sallysRead ?? null,
      context: decided.context ?? null,
      confidence: decided.confidence ?? null,
    };
  }
  // Autonomous path — pull from the most recent decide step's output.
  const decideStep = [...episode.steps].reverse().find((s) => s.kind === 'DECIDE');
  const out = (decideStep?.output ?? null) as { reasoning?: string; confidence?: number } | null;
  if (!out) return null;
  if (!out.reasoning && out.confidence == null) return null;
  return {
    sallysRead: out.reasoning ?? null,
    context: null,
    confidence: typeof out.confidence === 'number' ? out.confidence : null,
  };
}

// ─── Running mode (rare fallback — terminal-not-yet-reached, no pending) ─

function RunningMode({ episode, onClose }: { episode: DeskEpisodeDetail; onClose: () => void }) {
  // Same title-strip rule as the other modes — agent · responsibility.
  const titleParts = [episode.ownerAgentName, episode.responsibilityTitle].filter(Boolean) as string[];
  const titleStrip = titleParts.length > 0 ? titleParts.join(' · ') : (episode.entityLabel ?? 'Episode');
  return (
    <FormSheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={titleStrip}
      entityType="desk-episode"
      mode="view"
      footerExtra={
        <div className="flex flex-1 justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
      pinnable
      resizable
    >
      <div className="mt-2 space-y-4">
        <StepTimeline steps={episode.steps} />
        <EpisodeMemoriesInfluenced
          episodeId={episode.id}
          agentKey={episode.ownerAgentKey}
          retrievedMemoryIds={episode.retrievedMemoryIds}
        />
      </div>
    </FormSheet>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────

function SheetSkeleton() {
  return (
    <div className="mt-2 space-y-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function serialiseArtifact(artifact: ApprovalArtifact): Record<string, unknown> {
  if (artifact.kind === 'email') {
    return { to: artifact.to, subject: artifact.subject, body: artifact.body };
  }
  return artifact as unknown as Record<string, unknown>;
}
