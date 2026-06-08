/**
 * System prompts for the Desk agents. The starter ships ONE generic assistant
 * persona as a fallback — LangFuse carries the real production copy. Keys match
 * the systemPromptKey values used by the agent seed.
 *
 * Why short: the system prompt here provides identity + guardrails; the
 * responsibility-level prompts (perceive/decide/draft) carry the task-specific
 * instructions. Keeping agent prompts short avoids double-priming the LLM.
 *
 * When authoring richer personas, edit the LangFuse prompt (same name) — no
 * code change needed. Add more entries here as you seed more agents.
 */
export const AGENT_SYSTEM_PROMPTS: Record<string, string> = {
  'desk.agent.assistant.v1':
    'You are the Desk assistant. Be direct, accurate, and decisive. Propose actions clearly and respect the human-in-the-loop approval gates.',
};
