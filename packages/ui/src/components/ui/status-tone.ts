/**
 * Status tones — the six meanings a status badge can carry, mapped once to theme-token classes.
 * Every feature maps its own enum → tone (`StatusVariant`) and never writes a colour class for a status.
 *
 * | tone    | means                 | e.g.                                      |
 * | ------- | --------------------- | ----------------------------------------- |
 * | neutral | not started           | Draft, Pending, Received                  |
 * | info    | moving                | Active, Running, Processing               |
 * | warning | waiting on a person   | Awaiting review, Blocked, On hold         |
 * | success | done well             | Done, Approved, Succeeded, Accepted       |
 * | danger  | stopped               | Failed, Rejected, Cancelled, Expired      |
 * | muted   | retired               | Deprecated, Merged, Archived              |
 */
export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'muted';

export const STATUS_TONE_ORDER: readonly StatusTone[] = ['neutral', 'info', 'warning', 'success', 'danger', 'muted'];

/**
 * Badge classes per tone — dark-safe theme tokens only (see tailwind-preset / globals.css).
 * A tinted tone's label wears the `*-text` token, never the fill hue: amber and green fills read 1.7–2.8:1 on their
 * own tint in light theme, the `-text` tokens clear WCAG AA (≥ 4.5:1) in both themes. Neutral keeps a border so the
 * badge still reads as a badge on a card (`bg-muted` alone vanishes on `bg-card`).
 */
export const STATUS_TONES: Record<StatusTone, string> = {
  neutral: 'border-border bg-muted text-foreground',
  info: 'border-transparent bg-info/15 text-info-text',
  // "warning" renders on the amber `caution` token — the orange `warning` token is for alerts.
  warning: 'border-transparent bg-caution/15 text-caution-text',
  success: 'border-transparent bg-success/15 text-success-text',
  danger: 'border-transparent bg-critical/15 text-critical-text',
  muted: 'border-dashed border-border bg-transparent text-muted-foreground',
};

/** The class string a `Badge` wears for a tone. Unknown input falls back to neutral rather than to no colour. */
export function toneBadgeClass(tone: StatusTone): string {
  return STATUS_TONES[tone] ?? STATUS_TONES.neutral;
}

/** The shape of every feature's `*_VARIANTS` entry: a text label and a tone — never a class string. */
export interface StatusVariant {
  label: string;
  tone: StatusTone;
}
