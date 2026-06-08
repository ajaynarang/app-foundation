import type { WireItem, WireKind, WireSeverity } from '@sally/shared-types';
import { WIRE_COALESCE_THRESHOLD, WIRE_COALESCE_WINDOW_MS } from '../constants';

/**
 * A run of >=WIRE_COALESCE_THRESHOLD same-kind wire items that arrived within
 * WIRE_COALESCE_WINDOW_MS of each other, collapsed into a single row.
 */
export interface CoalescedGroup {
  type: 'group';
  /** Stable id derived from the member ids — safe as a React key. */
  id: string;
  kind: WireKind;
  /** Highest severity among members — drives the stripe color. */
  severity: WireSeverity;
  /** Members, newest first (same order as input). */
  items: WireItem[];
  /** Timestamp of the newest member. */
  timestamp: string;
}

/** A coalesced wire renders either a plain item or a collapsed group. */
export type WireRow = WireItem | CoalescedGroup;

const SEVERITY_RANK: Record<WireSeverity, number> = {
  critical: 3,
  caution: 2,
  info: 1,
};

export function isCoalescedGroup(row: WireRow): row is CoalescedGroup {
  return (row as CoalescedGroup).type === 'group';
}

function highestSeverity(items: WireItem[]): WireSeverity {
  return items.reduce<WireSeverity>(
    (worst, item) => (SEVERITY_RANK[item.severity] > SEVERITY_RANK[worst] ? item.severity : worst),
    'info',
  );
}

function buildGroup(run: WireItem[]): CoalescedGroup {
  return {
    type: 'group',
    id: `group:${run[0].kind}:${run[0].id}:${run[run.length - 1].id}`,
    kind: run[0].kind,
    severity: highestSeverity(run),
    items: run,
    timestamp: run[0].timestamp,
  };
}

/**
 * Collapse SSE storms into group rows.
 *
 * Walks the wire (newest first) and groups a *contiguous run* of same-kind
 * items whose timestamps all fall within WIRE_COALESCE_WINDOW_MS of the run's
 * newest member. A run only collapses once it reaches WIRE_COALESCE_THRESHOLD;
 * shorter runs pass through as individual items. Cross-kind grouping is
 * intentionally out of scope — a run breaks the moment `kind` changes.
 */
export function coalesceWire(items: WireItem[]): WireRow[] {
  if (items.length === 0) return [];

  const rows: WireRow[] = [];
  let run: WireItem[] = [];

  const flush = () => {
    if (run.length === 0) return;
    if (run.length >= WIRE_COALESCE_THRESHOLD) {
      rows.push(buildGroup(run));
    } else {
      rows.push(...run);
    }
    run = [];
  };

  for (const item of items) {
    if (run.length === 0) {
      run = [item];
      continue;
    }
    const head = run[0];
    const sameKind = item.kind === head.kind;
    const headMs = new Date(head.timestamp).getTime();
    const itemMs = new Date(item.timestamp).getTime();
    const withinWindow =
      Number.isFinite(headMs) && Number.isFinite(itemMs) && headMs - itemMs <= WIRE_COALESCE_WINDOW_MS;

    if (sameKind && withinWindow) {
      run.push(item);
    } else {
      flush();
      run = [item];
    }
  }
  flush();

  return rows;
}
