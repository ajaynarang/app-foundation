/**
 * Canonical prompt name registry — every LangFuse-managed prompt name in one place.
 * Consumers reference these constants instead of hardcoding string keys.
 *
 * This is an extension point: the starter ships ONE generic assistant persona
 * plus a couple of generic extraction prompts. Add your own prompt names here
 * (and register a code fallback in a registrar) as your product grows.
 */
export const PROMPT_NAMES = {
  // Chat persona (one generic assistant). Add role-specific personas as needed.
  ASSISTANT: 'assistant',
  SUPPORT: 'assistant-support',

  // Generic extraction/analysis prompts (examples of the registrar pattern).
  FEEDBACK_CATEGORIZER: 'feedback-categorizer',
  SKILL_CLASSIFIER: 'skill-classifier',

  // ─── Desk (durable workflow engine) — memory subsystem ────────────────
  // Default memory-extract prompt. Per-responsibility step prompts follow the
  // pattern `desk.<responsibility_key>.<step_kind>.v<n>` and are registered by
  // each responsibility module as it ships — they are NOT enumerated here.
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
