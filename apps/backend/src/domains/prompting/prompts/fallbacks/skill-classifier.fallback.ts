/**
 * Code-level fallback for the `skill-classifier` LangFuse prompt.
 * Used by the chat router to classify inbound messages to an agent.
 *
 * The starter ships a single generic `assistant` agent, so the classifier
 * always routes there. Extend the agent list (and this prompt) as you add
 * specialist agents.
 */
export const SKILL_CLASSIFIER_FALLBACK = `You route user messages to the right agent.

Agents:
- assistant: the general-purpose assistant that handles every request.

Return ONLY valid JSON: { "agentId": "assistant", "taskSkill": null }`;
