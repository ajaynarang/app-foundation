/**
 * Display formatters based on user preferences
 * These functions format values according to user's preferred units and formats
 */

// ============================================================================
// DISTANCE FORMATTING
// ============================================================================

export function formatDistance(miles: number, unit: 'MILES' | 'KILOMETERS' = 'MILES'): string {
  if (unit === 'KILOMETERS') {
    const km = miles * 1.60934;
    return `${km.toFixed(1)} km`;
  }
  return `${miles.toFixed(1)} mi`;
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

export function formatTime(date: Date, format: '12H' | '24H' = '12H'): string {
  if (format === '24H') {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================================
// CURRENCY FORMATTING
// ============================================================================

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency is invalid
    return `$${amount.toFixed(2)}`;
  }
}

/**
 * Format an amount in cents as a currency string.
 * Converts cents to dollars and formats with Intl.NumberFormat.
 * @param cents - Amount in cents (integer)
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted currency string like "$1,234.56"
 */
export function formatCents(cents: number, currency: string = 'USD'): string {
  return formatCurrency(cents / 100, currency);
}

/**
 * Format a USD amount that may be sub-cent (e.g. per-AI-invocation cost like
 * $0.0004). `formatCurrency` caps at 2 fraction digits, which rounds tiny
 * costs to $0.00 — so this variant accepts a configurable precision while
 * still rendering thousands separators. Accepts a numeric string (the shape
 * Prisma serializes Decimal columns as) or a number.
 *
 * @param value   numeric string or number of dollars
 * @param digits  fraction digits to show (default 2)
 */
export function formatUsdPrecise(value: string | number, digits: number = 2): string {
  const amount = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

export function formatDate(date: Date, format: string = 'MM/DD/YYYY'): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`;
  }
}

export function formatDateTime(
  date: Date,
  dateFormat: string = 'MM/DD/YYYY',
  timeFormat: '12H' | '24H' = '12H',
): string {
  return `${formatDate(date, dateFormat)} ${formatTime(date, timeFormat)}`;
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "in 3 days")
 * @param date - Date object or ISO date string
 * @returns Relative time string
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000)) // "2 hours ago"
 */
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1,
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(Math.abs(diffInSeconds) / secondsInUnit);

    if (interval >= 1) {
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      return rtf.format(diffInSeconds > 0 ? -interval : interval, unit as Intl.RelativeTimeFormatUnit);
    }
  }

  return 'just now';
}

// ============================================================================
// DURATION FORMATTING
// ============================================================================

export function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);

  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}

// ============================================================================
// WEIGHT FORMATTING (US/Metric)
// ============================================================================

export function formatWeight(lbs: number, system: 'US' | 'METRIC' = 'US'): string {
  if (system === 'METRIC') {
    const kg = lbs * 0.453592;
    return `${kg.toFixed(0)} kg`;
  }
  return `${lbs.toFixed(0)} lbs`;
}
