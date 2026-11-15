'use client';

import { Building2, Tag } from 'lucide-react';
import type { DeadlineListItem } from '@app/shared-types';
import { StatusBadge } from '@app/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { RelativeTime, RowActions } from '@/shared/components/page-chrome';
import { DEADLINE_STATE_VARIANTS } from '../constants';

interface TimersTableProps {
  deadlines: DeadlineListItem[];
  isRefreshing: boolean;
  onOnlyTenant: (slug: string) => void;
  onOnlyKind: (kind: string) => void;
}

/** One row per timer: compare kinds, due and fired times, and why a timer stopped — a table. */
export function TimersTable({ deadlines, isRefreshing, onOnlyTenant, onOnlyKind }: TimersTableProps) {
  return (
    <div className="rounded-lg border border-border">
      <Table aria-busy={isRefreshing} className={isRefreshing ? 'opacity-60' : undefined}>
        <TableHeader>
          <TableRow>
            <TableHead>Timer</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="whitespace-nowrap">Due</TableHead>
            <TableHead className="hidden md:table-cell">Tenant</TableHead>
            <TableHead className="hidden whitespace-nowrap lg:table-cell">Fired / cancelled</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Attempts</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deadlines.map((deadline) => (
            <TimerRow key={deadline.id} deadline={deadline} onOnlyTenant={onOnlyTenant} onOnlyKind={onOnlyKind} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TimerRow({
  deadline,
  onOnlyTenant,
  onOnlyKind,
}: { deadline: DeadlineListItem } & Pick<TimersTableProps, 'onOnlyTenant' | 'onOnlyKind'>) {
  const state = DEADLINE_STATE_VARIANTS[deadline.state];
  const stoppedAt = deadline.firedAt ?? deadline.cancelledAt;
  // What explains the row: the last error while it retries, the cancel reason once it stopped.
  const note = deadline.state === 'CANCELLED' ? deadline.cancelReason : deadline.lastError;
  return (
    <TableRow>
      <TableCell className="w-full max-w-0">
        <div className="truncate font-mono text-xs font-medium text-foreground">{deadline.kind}</div>
        <div className="truncate text-xs text-muted-foreground">
          {deadline.subjectType} · {deadline.subjectId}
        </div>
        {note && (
          <div
            className={
              deadline.state === 'FAILING'
                ? 'truncate text-xs text-caution-text'
                : 'truncate text-xs text-muted-foreground'
            }
          >
            {note}
          </div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        <RelativeTime iso={deadline.dueAt} />
        {deadline.state === 'FAILING' && deadline.lockedUntilAt && (
          <div>
            <RelativeTime iso={deadline.lockedUntilAt} prefix="retry" />
          </div>
        )}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
        {deadline.tenant.companyName}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">
        {stoppedAt ? <RelativeTime iso={stoppedAt} /> : '—'}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
        {deadline.attempts}
      </TableCell>
      <TableCell className="text-right">
        <RowActions
          menuLabel={`Actions for timer ${deadline.dedupeKey}`}
          items={[
            {
              label: `Only ${deadline.tenant.companyName}`,
              icon: Building2,
              onSelect: () => onOnlyTenant(deadline.tenant.tenantId),
            },
            { label: `Only ${deadline.kind}`, icon: Tag, onSelect: () => onOnlyKind(deadline.kind) },
          ]}
        />
      </TableCell>
    </TableRow>
  );
}
