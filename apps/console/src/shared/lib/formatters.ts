export const DISPLAY_FORMATS = {
  FRIENDLY: 'MMM d, yyyy',
  COMPACT: 'MMM d',
  DATE_TIME: 'MMM d, yyyy, h:mm a',
  COMPACT_DATE_TIME: 'MMM d, h:mm a',
  TIME_ONLY: 'h:mm a',
  MONTH_YEAR: 'MMMM yyyy',
  FULL: 'MMMM d, yyyy',
} as const;

export function formatTimestamp(isoString: string | null | undefined, _fmt?: string): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function useFormatters() {
  return {
    formatTimestamp,
    formatDistance: (miles: number) => `${miles.toFixed(1)} mi`,
    formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
    formatCents: (cents: number) => `$${(cents / 100).toFixed(2)}`,
  };
}
