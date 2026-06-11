/**
 * AI cost telemetry constants.
 *
 * `AI_LINK_REF_TYPES` is the closed vocabulary for `AiInvocation.linkRefType`
 * — the polymorphic discriminator that points a ledger row back at the
 * surface entity that produced it. It is NOT a Prisma enum (the column is a
 * free-form VARCHAR by design, so new surfaces can be added without a
 * migration), but the values ARE a fixed set that the read-side views query
 * against (e.g. `vw_ai_cost_per_episode` joins on `desk_episode_step`). A
 * typo at a write site would silently break those joins, so every producer
 * and consumer references this single map instead of inlining the literal.
 *
 * `agentId` strings are intentionally NOT centralized here — they're free
 * descriptive labels (e.g. `document-parser-fallback`) scoped to one call
 * site, not a shared vocabulary other code branches on.
 */
export const AI_LINK_REF_TYPES = {
  /** Document parse, keyed by document or attachment id. */
  DOCUMENT: 'document',
  /** A single Desk episode step row (DeskEpisodeStep.aiInvocationId mirrors this). */
  DESK_EPISODE_STEP: 'desk_episode_step',
  /** Desk memory extraction, keyed by the source episode. */
  DESK_EPISODE: 'desk_episode',
  /** Operator-authored Desk playbook rule embedding. */
  DESK_MEMORY_RULE: 'desk_memory_rule',
  /** Assistant chat turn, keyed by conversation message id (wired in a later PR). */
  CONVERSATION_MESSAGE: 'conversation_message',
  /** Knowledge-base ingestion chunk (wired in a later PR). */
  KB_DOCUMENT: 'kb_document',
} as const;

export type AiLinkRefType = (typeof AI_LINK_REF_TYPES)[keyof typeof AI_LINK_REF_TYPES];
