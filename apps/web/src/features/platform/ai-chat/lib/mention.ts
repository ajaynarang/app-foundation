import type { SearchApiResult } from '@/shared/lib/search';

export interface MentionFragment {
  /** index of the '@' in the value */
  at: number;
  /** text typed after '@' up to the caret */
  query: string;
}

/**
 * The active @-mention fragment from a textarea value + caret, or null.
 * A mention is the run of non-whitespace chars after an '@' that starts at a
 * word boundary (string start or after whitespace), with the caret inside it.
 * A mid-word '@' (e.g. an email address) does not trigger a mention.
 */
export function getMentionFragment(value: string, caret: number): MentionFragment | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  const before = at === 0 ? ' ' : upto[at - 1];
  if (!/\s/.test(before)) return null; // mid-word @ — not a mention
  const query = upto.slice(at + 1);
  if (/\s/.test(query)) return null; // whitespace after @ closes the mention
  return { at, query };
}

/**
 * Clean plain-text reference inserted into the message on select.
 * Never contains '@' — the picker is a lookup affordance, not message content.
 */
export function buildMentionText(result: SearchApiResult): string {
  switch (result.type) {
    case 'load':
      return result.referenceNumber ? `load ${result.id} (${result.referenceNumber})` : `load ${result.id}`;
    case 'driver':
      return `driver ${result.label}`;
    case 'customer':
      return `customer ${result.label}`;
    case 'invoice':
      return `invoice ${result.id}`;
    case 'settlement':
      return `settlement ${result.id}`;
    case 'vehicle':
      return `unit ${result.label.replace(/^Unit\s+/i, '')}`;
    case 'trip':
      return `trip ${result.id}`;
    case 'trailer':
      return `trailer ${result.id}`;
    case 'lane':
      return `lane "${result.label}"`;
    default:
      return result.label;
  }
}
