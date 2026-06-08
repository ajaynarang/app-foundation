'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@sally/ui';
import type { WireKind, WireSeverity } from '@sally/shared-types';
import { WireItem } from './wire-item';
import type { CoalescedGroup } from '../../utils/wire-coalesce';
import { WIRE_COALESCE_WINDOW_MS } from '../../constants';

interface WireGroupRowProps {
  group: CoalescedGroup;
}

const STRIPE_BY_SEVERITY: Record<WireSeverity, string> = {
  critical: 'bg-red-500',
  caution: 'bg-yellow-500',
  info: 'bg-muted-foreground/40',
};

/** Spelled-out severity so the stripe colour is never the only signal. */
const SEVERITY_LABEL: Record<WireSeverity, string> = {
  critical: 'Critical',
  caution: 'Caution',
  info: 'Info',
};

/** Plural noun for the group summary line, keyed off the wire kind. */
const KIND_NOUN: Record<WireKind, string> = {
  alert: 'alerts',
  message: 'messages',
  desk: 'desk updates',
  ops: 'load events',
};

/**
 * A coalesced wire group. Collapsed by default — a single clickable summary
 * row ("5 alerts in last 10s"); expands to reveal every member item.
 */
export function WireGroupRow({ group }: WireGroupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const windowSeconds = Math.round(WIRE_COALESCE_WINDOW_MS / 1000);
  const summary = `${group.items.length} ${KIND_NOUN[group.kind]} in last ${windowSeconds}s`;

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${SEVERITY_LABEL[group.severity]}: ${summary}`}
        className="relative flex w-full items-center gap-2 rounded-md px-3 py-2 pl-4 text-left text-xs hover:bg-muted/50 contrast-more:border contrast-more:border-border"
      >
        <span
          className={cn('absolute left-0 top-2 bottom-2 w-[3px] rounded-full', STRIPE_BY_SEVERITY[group.severity])}
          aria-hidden
        />
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="flex-1 font-medium text-foreground">{summary}</span>
      </button>
      {expanded && (
        <ul className="space-y-2 px-2 pb-2">
          {group.items.map((item) => (
            <li key={item.id}>
              <WireItem item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
