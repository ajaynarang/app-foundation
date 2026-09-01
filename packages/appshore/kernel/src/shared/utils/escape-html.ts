/**
 * Escape a value for interpolation into an HTML body.
 *
 * Notification titles and messages carry organizer- and coach-authored free
 * text (a cancellation reason, an announcement, a club name), and the email
 * body interpolates them into markup. Ampersand goes first — escaping it after
 * the others would double-encode the entities they just produced.
 */
export function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
