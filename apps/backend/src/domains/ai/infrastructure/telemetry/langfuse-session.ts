import type { AiCallContext } from '@app/shared-types';

/**
 * Langfuse trace attribution derived from the AI call context. The SAME shape
 * is consumed two ways:
 *   - Mastra agents → `tracingOptions.metadata.{sessionId,userId}` + `tags`
 *   - raw AI SDK    → `experimental_telemetry.metadata.{sessionId,userId,tags}`
 *
 * Both the Mastra LangfuseExporter and the @langfuse/otel span processor read
 * the PLAIN keys `sessionId` / `userId` / `tags` (NOT `langfuseSessionId` —
 * that's the legacy langfuse-openai-wrapper key and is silently ignored by the
 * OTel path). Keep this aligned with the frontend's `buildLangfuseSessionId`
 * (apps/web .../ai-spend/constants.ts) so the AI Spend deep-link resolves to a
 * real session.
 */
export interface LangfuseSessionAttrs {
  sessionId: string;
  userId: string;
  tags: string[];
}

/**
 * Session id mirrors the ledger's polymorphic link (`linkRefType:linkRefId`,
 * e.g. `conversation_message:conv_x`, `document:doc_y`) so every model call
 * for one entity groups into a single Langfuse session. Falls back to
 * `surface:tenantId` when a call has no linkRef (still groups per tenant+
 * surface rather than scattering).
 */
export function buildLangfuseSession(
  context: Pick<AiCallContext, 'tenantId' | 'surface' | 'agentId' | 'linkRefType' | 'linkRefId'>,
): LangfuseSessionAttrs {
  const sessionId = context.linkRefId
    ? `${context.linkRefType ?? 'session'}:${context.linkRefId}`
    : `${context.surface}:${context.tenantId}`;

  return {
    sessionId,
    userId: `tenant:${context.tenantId}`,
    tags: [context.surface, context.agentId].filter((t): t is string => Boolean(t)),
  };
}
