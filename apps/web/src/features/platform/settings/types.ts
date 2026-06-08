/**
 * TypeScript types for user preferences
 */

/**
 * Response from preferences reset endpoint
 * Returns the actual preferences object (type depends on scope parameter)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PreferencesResetResponse = any; // Backend returns UserPreferences
