// Code-level fallbacks for non-chat, non-Desk LangFuse prompts.
// LangFuse is the source of truth at runtime; these are only used when LangFuse
// is offline or a prompt hasn't been published. Add more fallbacks here as you
// register new extraction/analysis prompts.
export { CATEGORIZER_FALLBACK } from './feedback-categorizer.fallback';
export { SKILL_CLASSIFIER_FALLBACK } from './skill-classifier.fallback';
