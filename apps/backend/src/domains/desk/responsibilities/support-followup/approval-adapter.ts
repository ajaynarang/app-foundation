import type { ApprovalArtifact, ApprovalDecisionHeader } from '../../core/types';

import type { DecideOutput, DraftOutput, HydrateOutput, PerceiveOutput } from './step.types';

/**
 * Support follow-up approval adapter: what the approval sheet shows for this job, built at read time from the
 * episode's step outputs. The UI renders the shape and never branches on the job. Every input can be missing (a step
 * that has not run, an older episode), and each part then degrades to null.
 */
export interface SupportFollowupApprovalInputs {
  hydrate: HydrateOutput | null;
  perceive: PerceiveOutput | null;
  decide: DecideOutput | null;
  draft: DraftOutput | null;
  /** The action stored on the approval row: `{ ticketNumber, content }`. */
  proposedAction: Record<string, unknown>;
}

export interface SupportFollowupApprovalPayload {
  artifact: ApprovalArtifact | null;
  decisionHeader: ApprovalDecisionHeader | null;
  assistantRead: string | null;
  context: string[] | null;
  confidence: number | null;
}

export function buildSupportFollowupApprovalPayload(
  input: SupportFollowupApprovalInputs,
): SupportFollowupApprovalPayload {
  const ticket = input.hydrate?.entity.ticket ?? null;
  // The stored action is what will run; the draft is the fallback for an approval row written without one.
  const content = text(input.proposedAction.content) ?? input.draft?.content ?? null;
  const ticketNumber = ticket?.ticketNumber ?? text(input.proposedAction.ticketNumber);

  const artifact: ApprovalArtifact | null = content
    ? {
        kind: 'composite',
        summary: 'Post this reply on the support ticket.',
        blocks: [
          ...(ticketNumber ? [{ type: 'field' as const, label: 'Ticket', value: ticketNumber, mono: true }] : []),
          ...(ticket ? [{ type: 'field' as const, label: 'Subject', value: ticket.subject }] : []),
          { type: 'body' as const, format: 'text' as const, content },
        ],
      }
    : null;

  const decisionHeader: ApprovalDecisionHeader | null = ticket
    ? {
        title: 'Ask support for an update',
        entityMeta: `${ticket.ticketNumber} · ${ticket.priority.toLowerCase()} priority · quiet ${ticket.daysQuiet}d`,
      }
    : null;

  const context = [
    input.decide?.reasoning,
    input.hydrate ? followUpLine(input.hydrate.entity.priorFollowUpCount) : undefined,
    input.hydrate
      ? `${input.hydrate.entity.thread.length} repl${input.hydrate.entity.thread.length === 1 ? 'y' : 'ies'} on the ticket so far`
      : undefined,
  ].filter((line): line is string => !!line);

  return {
    artifact,
    decisionHeader,
    assistantRead: input.perceive?.summary ?? null,
    context: context.length ? context : null,
    confidence: clamp(input.draft?.confidence ?? input.decide?.confidence ?? input.perceive?.confidence ?? null),
  };
}

function followUpLine(count: number): string {
  if (count === 0) return 'No follow-up sent on this ticket yet';
  return `${count} follow-up${count === 1 ? '' : 's'} already sent on this ticket`;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The wire shape takes 0..1; a model can return anything. */
function clamp(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}
