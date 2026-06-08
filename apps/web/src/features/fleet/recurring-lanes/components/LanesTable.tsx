'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import {
  useActivateLane,
  useDeleteLane,
  useExpireLane,
  useGenerateNow,
  usePauseLane,
  useResumeLane,
  useSkipGeneration,
} from '../hooks/use-recurring-lanes';
import { RECURRING_LANE_STATUS_LABELS, type RecurringLane } from '../types';

// ─── Status Badge ─────────────────────────────────────────────────────────────

type LaneStatus = RecurringLane['status'];

const STATUS_BADGE_CLASSES: Record<LaneStatus, string> = {
  DRAFT: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600',
  ACTIVE: 'bg-muted text-muted-foreground border-border',
  PAUSED: 'bg-caution/10 text-caution border-caution/20',
  EXPIRED: 'bg-muted text-muted-foreground border-border',
};

function StatusBadge({ status }: { status: LaneStatus }) {
  return (
    <Badge variant="outline" className={`text-xs font-medium ${STATUS_BADGE_CLASSES[status]}`}>
      {RECURRING_LANE_STATUS_LABELS[status]}
    </Badge>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSchedule(scheduleType: string): string {
  switch (scheduleType.toLowerCase()) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Bi-weekly';
    case 'monthly':
      return 'Monthly';
    case 'custom':
      return 'Custom';
    default:
      return scheduleType;
  }
}

function formatNextGen(
  dateStr: string | null | undefined,
  formatCalendarDate: (dateStr: string | null | undefined, fmt?: string) => string,
): string {
  return formatCalendarDate(dateStr, DISPLAY_FORMATS.FRIENDLY);
}

// ─── Actions Dropdown ─────────────────────────────────────────────────────────

interface ActionsDropdownProps {
  lane: RecurringLane;
  onEdit?: (lane: RecurringLane) => void;
  onView?: (lane: RecurringLane) => void;
  onDelete?: (laneId: number) => void;
}

function ActionsDropdown({ lane, onEdit, onView, onDelete }: ActionsDropdownProps) {
  const activate = useActivateLane();
  const pause = usePauseLane();
  const resume = useResumeLane();
  const generateNow = useGenerateNow();
  const skip = useSkipGeneration();
  const expire = useExpireLane();

  const isPending =
    activate.isPending ||
    pause.isPending ||
    resume.isPending ||
    generateNow.isPending ||
    skip.isPending ||
    expire.isPending;

  const { status } = lane;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" loading={isPending}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {/* View & Edit — always at top */}
        {onView && <DropdownMenuItem onClick={() => onView(lane)}>View Details</DropdownMenuItem>}
        {onEdit && status !== 'EXPIRED' && <DropdownMenuItem onClick={() => onEdit(lane)}>Edit</DropdownMenuItem>}

        {/* Activate — only when draft or paused */}
        {(status === 'DRAFT' || status === 'PAUSED') && (
          <DropdownMenuItem onClick={() => activate.mutate(lane.id)}>Activate</DropdownMenuItem>
        )}

        {/* Pause — only when active */}
        {status === 'ACTIVE' && <DropdownMenuItem onClick={() => pause.mutate(lane.id)}>Pause</DropdownMenuItem>}

        {/* Resume — only when paused */}
        {status === 'PAUSED' && <DropdownMenuItem onClick={() => resume.mutate(lane.id)}>Resume</DropdownMenuItem>}

        {/* Generate Now — only when active */}
        {status === 'ACTIVE' && (
          <DropdownMenuItem onClick={() => generateNow.mutate(lane.id)}>Generate Now</DropdownMenuItem>
        )}

        {/* Skip — only when active and not already skipped */}
        {status === 'ACTIVE' && !lane.skipNextGeneration && (
          <DropdownMenuItem onClick={() => skip.mutate(lane.id)}>Skip Next Generation</DropdownMenuItem>
        )}

        {/* Expire — when active or paused */}
        {(status === 'ACTIVE' || status === 'PAUSED') && (
          <DropdownMenuItem className="text-critical focus:text-critical" onClick={() => expire.mutate(lane.id)}>
            Expire Lane
          </DropdownMenuItem>
        )}

        {/* Delete — all statuses except expired */}
        {status !== 'EXPIRED' && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(e) => {
                e.preventDefault();
                onDelete(lane.id);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Lane
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface LanesTableProps {
  lanes: RecurringLane[];
  total: number;
  isLoading: boolean;
  hasSearch: boolean;
  onCreateLane?: () => void;
  onEditLane?: (lane: RecurringLane) => void;
  onViewLane?: (lane: RecurringLane) => void;
}

export function LanesTable({
  lanes,
  total,
  isLoading,
  hasSearch,
  onCreateLane,
  onEditLane,
  onViewLane,
}: LanesTableProps) {
  const { formatCalendarDate } = useFormatters();
  const [deleteLaneId, setDeleteLaneId] = useState<number | null>(null);
  const deleteLane = useDeleteLane();

  // Compute summary counts
  const summary = lanes.reduce(
    (acc, lane) => {
      acc[lane.status] = (acc[lane.status] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<LaneStatus, number>>,
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (lanes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">
            {hasSearch
              ? 'No lanes match your search.'
              : 'No recurring lanes yet. Create your first lane to get started.'}
          </p>
          {!hasSearch && onCreateLane && (
            <Button onClick={onCreateLane} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Lane
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table (md+) */}
      <div className="hidden md:block border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lane Name</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead className="hidden xl:table-cell text-center">Auto-Create</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Next Gen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lanes.map((lane) => (
              <TableRow key={lane.id}>
                {/* Lane Name */}
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewLane?.(lane)}
                    className="font-medium text-foreground hover:underline text-left p-0 h-auto"
                  >
                    {lane.name}
                  </Button>
                  <div className="text-xs text-muted-foreground font-mono">{lane.laneId}</div>
                </TableCell>

                {/* Customer */}
                <TableCell>
                  <span className="text-sm text-foreground">{lane.customerName}</span>
                </TableCell>

                {/* Schedule */}
                <TableCell>
                  <Badge variant="muted" className="text-xs">
                    {formatSchedule(lane.scheduleType)}
                  </Badge>
                </TableCell>

                {/* Auto-Create */}
                <TableCell className="hidden xl:table-cell text-center">
                  <span
                    className={`text-xs font-medium ${
                      lane.autoCreate ? 'text-muted-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {lane.autoCreate ? 'Yes' : 'No'}
                  </span>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <StatusBadge status={lane.status} />
                </TableCell>

                {/* Next Gen */}
                <TableCell className="hidden lg:table-cell">
                  {lane.skipNextGeneration ? (
                    <span className="text-xs text-caution">Skipped</span>
                  ) : (
                    <span className="text-sm text-foreground">
                      {formatNextGen(lane.nextGenerationDate, formatCalendarDate)}
                    </span>
                  )}
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  <ActionsDropdown lane={lane} onEdit={onEditLane} onView={onViewLane} onDelete={setDeleteLaneId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card Layout (<md) */}
      <div className="md:hidden space-y-3">
        {lanes.map((lane) => (
          <Card key={lane.id}>
            <CardContent className="p-4 space-y-3">
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1" onClick={() => onViewLane?.(lane)} role="button" tabIndex={0}>
                  <p className="font-medium text-foreground leading-snug truncate">{lane.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{lane.laneId}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={lane.status} />
                  <ActionsDropdown lane={lane} onEdit={onEditLane} onView={onViewLane} onDelete={setDeleteLaneId} />
                </div>
              </div>

              {/* Customer */}
              <p className="text-sm text-muted-foreground truncate">{lane.customerName}</p>

              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="muted" className="text-xs">
                  {formatSchedule(lane.scheduleType)}
                </Badge>
                {lane.autoCreate && <span className="text-xs text-muted-foreground font-medium">Auto-create on</span>}
                {lane.skipNextGeneration ? (
                  <span className="text-xs text-caution">Next gen skipped</span>
                ) : lane.nextGenerationDate ? (
                  <span className="text-xs text-muted-foreground">
                    Next: {formatNextGen(lane.nextGenerationDate, formatCalendarDate)}
                  </span>
                ) : null}
              </div>

              {/* Loads generated */}
              <p className="text-xs text-muted-foreground">
                {lane.totalLoadsGenerated} load
                {lane.totalLoadsGenerated !== 1 ? 's' : ''} generated
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary Footer */}
      <p className="text-sm text-muted-foreground">
        {total} lane{total !== 1 ? 's' : ''}
        {summary.ACTIVE != null && summary.ACTIVE > 0 && <> &middot; {summary.ACTIVE} active</>}
        {summary.PAUSED != null && summary.PAUSED > 0 && <> &middot; {summary.PAUSED} paused</>}
        {summary.DRAFT != null && summary.DRAFT > 0 && <> &middot; {summary.DRAFT} draft</>}
        {summary.EXPIRED != null && summary.EXPIRED > 0 && (
          <span className="text-critical"> &middot; {summary.EXPIRED} expired</span>
        )}
      </p>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteLaneId !== null} onOpenChange={(open) => !open && setDeleteLaneId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lane?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this lane. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteLaneId) {
                  deleteLane.mutate(deleteLaneId);
                  setDeleteLaneId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
