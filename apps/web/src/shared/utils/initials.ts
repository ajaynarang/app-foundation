/**
 * Crash-proof user initials for avatars.
 *
 * User objects can arrive with missing name fields (stale persisted sessions,
 * partial profiles, third-party identities) — initials must degrade, never throw.
 */
export function getInitials(firstName?: string | null, lastName?: string | null, fallback = 'U'): string {
  const initials = `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase();
  return initials || fallback;
}
