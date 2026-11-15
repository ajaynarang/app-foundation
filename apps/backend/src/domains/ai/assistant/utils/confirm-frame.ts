/**
 * Build the `9:` confirm-card frame from a suspended agent run.
 *
 * Mastra reports a suspension as an envelope, `{ toolCallId, toolName, suspendPayload, args, resumeSchema }`, where
 * `suspendPayload` is the card confirm-action built from the server-recorded intent and `args` is the model's own
 * confirm-action input (its prose). The web `ConfirmationCard` reads `action`, `description`, `tool`, `args`,
 * `toolCallId` and `runId` from the top level, so the frame is the server card itself plus the resume keys: the
 * model's text never reaches the card.
 */
export function buildConfirmFrame(suspendPayload: unknown, runId: string | undefined): Record<string, unknown> {
  if (!suspendPayload || typeof suspendPayload !== 'object') {
    return { data: suspendPayload, runId };
  }
  const outer = suspendPayload as Record<string, unknown>;
  const inner = outer.suspendPayload;
  if (inner && typeof inner === 'object') {
    const card = inner as Record<string, unknown>;
    return { ...card, toolCallId: card.toolCallId ?? outer.toolCallId, runId };
  }
  return { ...outer, runId };
}
