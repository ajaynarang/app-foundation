import { AiInvocationStatus, AiSurface } from '@app/shared-types';
import type { StatusVariant } from '@app/ui';

import type { AiSurface as AiSurfaceType } from './types';

/**
 * Human labels per surface. Keyed off the generated `AiSurface` enum so a new surface forces a compile error here
 * until labelled. A surface is a category, not a state: it renders as a neutral chip.
 */
export const SURFACE_LABELS: Record<AiSurfaceType, string> = {
  [AiSurface.CHAT]: 'Chat',
  [AiSurface.DESK_STEP]: 'Desk Step',
  [AiSurface.MEMORY_EXTRACT]: 'Memory Extract',
  [AiSurface.EMBEDDING]: 'Embedding',
  [AiSurface.KB_INGEST]: 'KB Ingest',
};

/** One tone per invocation outcome (ui-grammar-guard.test.ts): a call went through, or it was stopped. */
export const INVOCATION_STATUS_VARIANTS: Record<AiInvocationStatus, StatusVariant> = {
  [AiInvocationStatus.OK]: { label: 'Succeeded', tone: 'success' },
  [AiInvocationStatus.ERROR]: { label: 'Failed', tone: 'danger' },
  [AiInvocationStatus.TIMEOUT]: { label: 'Timed out', tone: 'danger' },
  [AiInvocationStatus.RATE_LIMITED]: { label: 'Rate limited', tone: 'danger' },
  [AiInvocationStatus.BUDGET_BLOCKED]: { label: 'Budget blocked', tone: 'danger' },
};

/** Day-window options for the spend view. */
export const WINDOW_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '1', label: 'Today' },
] as const satisfies ReadonlyArray<{ value: string; label: string }>;

/**
 * Project-scoped Langfuse base, e.g. `https://us.cloud.langfuse.com/project/<id>`.
 * Every Langfuse UI route is nested under the project id — a bare
 * `/traces` or `/sessions/<id>` path 404s. The project id can't be derived
 * from the public key (Langfuse keys are opaque), so it's a separate public
 * env var. Returns null when either piece is unset so the UI hides the link
 * rather than rendering a 404.
 */
function langfuseProjectBase(): string | null {
  const base = process.env.NEXT_PUBLIC_LANGFUSE_BASE_URL;
  const projectId = process.env.NEXT_PUBLIC_LANGFUSE_PROJECT_ID;
  if (!base || !projectId) return null;
  return `${base.replace(/\/$/, '')}/project/${projectId}`;
}

/**
 * Build a Langfuse trace deep-link: `{base}/project/{id}/traces/{traceId}`.
 * Returns null when the base URL / project id aren't configured so the UI can
 * hide the link rather than render a broken one.
 */
export function getLangfuseTraceUrl(traceId: string | null): string | null {
  if (!traceId) return null;
  const projectBase = langfuseProjectBase();
  if (!projectBase) return null;
  return `${projectBase}/traces/${traceId}`;
}

/**
 * The Langfuse `session id` we attach to every model call via the AI SDK's
 * `experimental_telemetry` / Mastra metadata. It mirrors the ledger's
 * `linkRefType:linkRefId` (e.g. `document:doc_abc`,
 * `conversation_message:conv_xyz`), with a `surface:tenant` fallback when a
 * row has no linkRef. This is the one correlation handle we control
 * end-to-end across chat, documents and desk — unlike the trace id, which the
 * Mastra and raw-SDK tracing paths derive differently. Keep this in sync with
 * `buildLangfuseTelemetry` on the backend (structured-output.service.ts).
 */
export function buildLangfuseSessionId(row: {
  surface: string;
  linkRefType: string | null;
  linkRefId: string | null;
  tenantId?: number;
}): string {
  if (row.linkRefId) {
    return `${row.linkRefType ?? 'session'}:${row.linkRefId}`;
  }
  return row.tenantId != null ? `${row.surface}:${row.tenantId}` : row.surface;
}

/**
 * Deep-link to a Langfuse session: `{base}/project/{id}/sessions/{sessionId}`.
 * The session-replay view groups every trace we tagged with this session id.
 * Prefer this over the trace-id link: `langfuseTraceId` is currently never
 * populated (the three tracing layers disagree on the id), whereas the session
 * id is always derivable from columns the API already returns. Returns null
 * when the base URL / project id aren't configured so the UI hides a broken
 * link.
 */
export function getLangfuseSessionUrl(sessionId: string | null): string | null {
  if (!sessionId) return null;
  const projectBase = langfuseProjectBase();
  if (!projectBase) return null;
  return `${projectBase}/sessions/${encodeURIComponent(sessionId)}`;
}
