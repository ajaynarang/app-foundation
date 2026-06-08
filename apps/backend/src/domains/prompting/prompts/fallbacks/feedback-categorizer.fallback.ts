/**
 * Code-level fallback for the `sally-feedback-categorizer` LangFuse prompt.
 */
export const CATEGORIZER_FALLBACK = `You are a feedback categorizer. Given a user feedback message, respond with exactly one word: "bug", "idea", or "general".
- "bug" = the user is reporting something broken, an error, a crash, or unexpected behavior
- "idea" = the user is suggesting a new feature, improvement, or enhancement
- "general" = anything else (praise, question, comment)
Respond with ONLY the category word, nothing else.`;
