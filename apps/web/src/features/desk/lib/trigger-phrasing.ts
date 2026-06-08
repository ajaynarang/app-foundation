/**
 * Trigger phrasing — converts a responsibility's registry trigger entry into
 * { icon, text } for the Responsibilities tab. Never shows a raw cron or
 * event key if a human phrasing exists.
 */

export type TriggerIcon = 'schedule' | 'event' | 'webhook' | 'manual';

export interface TriggerPhrase {
  icon: TriggerIcon;
  text: string;
}

// Backend sends triggers as discriminated unions (kind: 'scheduled' |
// 'domain-event' | 'webhook' | 'manual'). Accept a superset; coerce.
type TriggerInput =
  | { kind: 'scheduled'; cron: string; tz?: string }
  | { kind: 'domain-event'; event: string; condition?: Record<string, unknown> }
  | { kind: 'webhook'; source: string }
  | { kind: 'manual' }
  | Record<string, unknown>;

/**
 * Human-readable mapping for well-known domain events. The canonical copy
 * appears under the trigger icon on the Responsibilities tab.
 */
const DOMAIN_EVENT_LABELS: Record<string, string> = {
  'sally.invoice.paid': 'an invoice is paid',
  'sally.invoice.overdue': 'an invoice becomes overdue',
  'sally.load.created': 'a load is created',
  'sally.load.delivered': 'a load is delivered',
  'sally.load.tendered': 'a load is tendered',
  'sally.driver.clocked-on': 'a driver clocks on',
  'sally.driver.clocked-off': 'a driver clocks off',
  'sally.document.expiring': 'a document is about to expire',
};

export function triggerPhrase(input: TriggerInput): TriggerPhrase {
  if (!input || typeof input !== 'object') {
    return { icon: 'manual', text: 'Run on-demand' };
  }
  const kind = (input as { kind?: string }).kind;

  if (kind === 'scheduled') {
    const cron = (input as { cron?: string }).cron ?? '';
    return { icon: 'schedule', text: describeCron(cron) };
  }
  if (kind === 'domain-event') {
    const event = (input as { event?: string }).event ?? '';
    const label = DOMAIN_EVENT_LABELS[event];
    return { icon: 'event', text: label ? `Runs when ${label}` : `Runs on event: ${event}` };
  }
  if (kind === 'webhook') {
    const source = ((input as { source?: string }).source ?? 'external').trim();
    return { icon: 'webhook', text: `Runs on ${titleCase(source)} webhooks` };
  }
  // Default + 'manual'
  return { icon: 'manual', text: 'Run on-demand' };
}

// ─── Cron helpers ──────────────────────────────────────────────────────

const HOUR_PHRASES: Record<string, string> = {
  '0': '12 AM',
  '6': '6 AM',
  '7': '7 AM',
  '8': '8 AM',
  '9': '9 AM',
  '10': '10 AM',
  '12': '12 PM',
  '17': '5 PM',
  '18': '6 PM',
};

const WEEKDAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return `Runs on schedule: ${cron}`;
  const [minute, hour, dom, month, dow] = parts;

  // Daily at fixed hour: "0 9 * * *"
  if (minute === '0' && month === '*' && dom === '*' && dow === '*' && isFixedHour(hour)) {
    return `Runs daily at ${hourPhrase(hour)} (tenant time)`;
  }
  // Weekly on fixed weekday + hour: "0 9 * * 1"
  if (minute === '0' && month === '*' && dom === '*' && isFixedHour(hour) && isFixedWeekday(dow)) {
    return `Runs ${WEEKDAY_NAMES[Number(dow)]} at ${hourPhrase(hour)} (tenant time)`;
  }
  return `Runs on schedule: ${cron}`;
}

function isFixedHour(h: string): boolean {
  return /^\d+$/.test(h);
}

function isFixedWeekday(d: string): boolean {
  return /^[0-6]$/.test(d);
}

function hourPhrase(h: string): string {
  if (HOUR_PHRASES[h]) return HOUR_PHRASES[h];
  const n = Number(h);
  if (Number.isNaN(n)) return `${h}:00`;
  if (n === 0) return '12 AM';
  if (n < 12) return `${n} AM`;
  if (n === 12) return '12 PM';
  return `${n - 12} PM`;
}

function titleCase(s: string): string {
  if (!s) return '';
  return s[0].toUpperCase() + s.slice(1);
}
