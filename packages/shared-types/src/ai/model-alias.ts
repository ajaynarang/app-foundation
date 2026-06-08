import { z } from 'zod';

/**
 * Semantic model aliases used by the AI provider registry.
 *
 * Aliases decouple application code from provider-specific model IDs so switches
 * (e.g. gateway → direct, model version bump) happen in one place.
 *
 *   fast     → Haiku tier   — chat replies, quick classification, summaries
 *   standard → Sonnet tier  — reasoning, extraction, structured outputs
 *   powerful → Opus tier    — complex extraction, critical-path fallbacks
 *
 * Kept in shared-types so backend services and future console/UI code use the
 * same vocabulary.
 */
export const MODEL_ALIASES = ['fast', 'standard', 'powerful'] as const;
export const ModelAliasSchema = z.enum(MODEL_ALIASES);
export type ModelAlias = (typeof MODEL_ALIASES)[number];
