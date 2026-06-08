/**
 * Canonical prompt name registry — every LangFuse-managed prompt name in one place.
 * Consumers reference these constants instead of hardcoding string keys.
 */
export const PROMPT_NAMES = {
  // Chat personas
  PROSPECT: 'sally-prospect',
  DISPATCHER: 'sally-dispatcher',
  DRIVER: 'sally-driver',
  CUSTOMER: 'sally-customer',
  OWNER: 'sally-owner',
  ADMIN: 'sally-admin',
  SUPER_ADMIN: 'sally-super_admin',
  SUPPORT: 'sally-support',

  // Domain agent personas (chat mode)
  BILLING: 'sally-billing',
  COMPLIANCE: 'sally-compliance',
  SAFETY: 'sally-safety',
  ROUTE: 'sally-route',
  PAYROLL: 'sally-payroll',
  MAINTENANCE: 'sally-maintenance',
  FUEL: 'sally-fuel',

  // Extraction/analysis agents
  RATECON_PARSER: 'sally-ratecon-parser',
  SHIELD_ANALYST: 'sally-shield-analyst',
  ALERT_BRIEFING: 'sally-alert-briefing',
  BRIEFING: 'sally-briefing',
  FUEL_RECEIPT_PARSER: 'sally-fuel-receipt-parser',
  FEEDBACK_CATEGORIZER: 'sally-feedback-categorizer',
  SKILL_CLASSIFIER: 'sally-skill-classifier',
  LOAD_BOARD_SEARCH_PARSER: 'sally-load-board-search-parser',

  // ─── Desk (v3) — per-responsibility step prompts ──────────────────────
  // Vocabulary: desk.<responsibility_key>.<step_kind>.v<version>
  // Registered by the backend-worker's responsibility modules on init.
  // Added per responsibility as they ship.
  DESK_AR_FOLLOWUP_PERCEIVE: 'desk.ar_followup.perceive.v1',
  DESK_AR_FOLLOWUP_DECIDE: 'desk.ar_followup.decide.v1',
  DESK_AR_FOLLOWUP_DRAFT: 'desk.ar_followup.draft.v1',
  DESK_CLOSEOUT_REVIEW_PERCEIVE: 'desk.closeout_review.perceive.v1',
  DESK_CLOSEOUT_REVIEW_DECIDE: 'desk.closeout_review.decide.v1',
  DESK_CLOSEOUT_REVIEW_DRAFT: 'desk.closeout_review.draft.v1',

  DESK_DOCUMENT_EXPIRY_PERCEIVE: 'desk.document_expiry.perceive.v1',
  DESK_DOCUMENT_EXPIRY_DECIDE: 'desk.document_expiry.decide.v1',
  DESK_DOCUMENT_EXPIRY_DRAFT: 'desk.document_expiry.draft.v1',

  DESK_SETTLEMENT_REVIEW_PERCEIVE: 'desk.settlement_review.perceive.v1',
  DESK_SETTLEMENT_REVIEW_DECIDE: 'desk.settlement_review.decide.v1',

  // ─── Desk (v3) — memory subsystem ─────────────────────────────────────
  // Default memory-extract prompt. Per-responsibility variants follow the
  // pattern desk.memory.extract.<responsibilityKey>.v1 and are looked up
  // first; this default is the fallback.
  DESK_MEMORY_EXTRACT: 'desk.memory.extract.v1',
} as const;

export type PromptName = (typeof PROMPT_NAMES)[keyof typeof PROMPT_NAMES];

/**
 * Metadata parsed from the YAML frontmatter of a local `.md` skill file.
 * Agent ids are stringly-typed here to keep the platform layer independent of domain types.
 */
export interface SkillMetadata {
  name: string;
  type: 'domain' | 'task';
  description: string;
  primaryAgent?: string;
  triggers?: string[];
  requiresDomainSkills?: string[];
  crossDomainAgents?: string[];
  maxSteps?: number;
}

export interface ParsedSkill {
  metadata: SkillMetadata;
  content: string;
}
