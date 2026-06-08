import type { ConditionsUISpec } from '../types';

/**
 * One-line summary of a responsibility's hard-rules object for the
 * briefing-card view. Uses the UI spec's field labels so it stays in sync
 * with whatever the backend defines. Returns "No rules configured yet."
 * when nothing has been set.
 */
export function summarizeConditions(
  spec: ConditionsUISpec | undefined,
  value: Record<string, unknown> | undefined | null,
): string {
  if (!spec || !value) return 'No rules configured yet.';
  const parts: string[] = [];

  for (const field of spec.fields) {
    const v = value[field.key];
    if (v === undefined || v === null || v === '' || v === false) continue;

    if (field.control === 'currency' && typeof v === 'number') {
      parts.push(`${field.label}: $${v.toLocaleString()}`);
    } else if (field.control === 'number' && typeof v === 'number') {
      parts.push(`${field.label}: ${v}`);
    } else if (field.control === 'checkbox' && v === true) {
      parts.push(field.label);
    } else if (field.control === 'customer-multiselect' && Array.isArray(v) && v.length > 0) {
      parts.push(`${field.label}: ${v.length}`);
    }
  }

  if (parts.length === 0) return 'No rules configured yet.';
  return parts.join(' · ');
}
