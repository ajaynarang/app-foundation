/**
 * Tenant Reset — Programmatic entry point.
 *
 * Use from scripts that need to reset a tenant without going through the CLI
 * (e.g. the demo engine's `resetDemoData`).
 */
export { runReset, soft, hard } from './core';
export type { ResetOptions, ResetRow, ResetSummary } from './core';
export { ALLOWED_TENANTS, SafetyError } from './safety';
export { REGISTRY, CATEGORIES, entriesForMode, REGISTERED_TABLES } from './registry';
export type { ResetMode, RegistryEntry, Category, SoftBehavior } from './registry';
