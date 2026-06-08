'use client';

import { useEffect, useRef, useState } from 'react';
import { Pin, Check, X } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { cn } from '@sally/ui';
import {
  useShiftNotes,
  useCreateShiftNote,
  useTogglePinShiftNote,
  useDeleteShiftNote,
  useAcknowledgeHandoff,
} from '../../hooks/use-shift-notes';
import type { ShiftNote } from '@sally/shared-types';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

const PRIORITY_BORDER: Record<string, string> = {
  urgent: 'border-l-red-500',
  action_required: 'border-l-blue-500 dark:border-l-blue-400',
  info: 'border-l-muted-foreground/40',
};

/**
 * Shift notes ride the top of the Wire column. Collapses to a one-line
 * summary when scrolled past via IntersectionObserver — so the input row
 * stays visible without taking the whole column.
 */
export function ShiftNotesSticky() {
  const { data, isLoading } = useShiftNotes();
  const createMutation = useCreateShiftNote();
  const togglePinMutation = useTogglePinShiftNote();
  const deleteMutation = useDeleteShiftNote();
  const ackMutation = useAcknowledgeHandoff();

  const [noteText, setNoteText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, []);

  const allNotes = data?.notes ?? [];
  const handoff = data?.handoffStatus;
  // Pinned notes float to the top; the rest still show below, capped at 3 total.
  const pinned = allNotes.filter((n) => n.isPinned);
  const recent = [...pinned, ...allNotes.filter((n) => !n.isPinned)].slice(0, 3);

  const handleSubmit = () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    createMutation.mutate({ content: trimmed, isPinned: false, priority: 'info' });
    setNoteText('');
  };

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background">
      <div ref={sentinelRef} aria-hidden className="h-px" />
      {collapsed ? (
        <CollapsedSummary count={allNotes.length} acknowledged={handoff?.acknowledged ?? false} />
      ) : (
        <div className="px-3 py-2 space-y-2">
          <Header
            count={allNotes.length}
            acknowledged={handoff?.acknowledged ?? false}
            acknowledgedBy={handoff?.acknowledgedBy?.name}
            acknowledgedAt={handoff?.acknowledgedAt}
            onAcknowledge={() => ackMutation.mutate()}
            isAcknowledging={ackMutation.isPending}
            disableAck={allNotes.length === 0}
          />
          <div className="flex items-center gap-2">
            <Input
              placeholder="Leave a note for next shift..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleSubmit}
              loading={createMutation.isPending}
              disabled={!noteText.trim()}
              className="h-8 px-3 shrink-0"
            >
              Add
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-1.5">
              <Skeleton className="h-7 w-full rounded" />
              <Skeleton className="h-7 w-full rounded" />
            </div>
          ) : recent.length === 0 ? (
            <p className="text-2xs text-muted-foreground py-1">No shift notes.</p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((note) => (
                <NoteRow
                  key={note.noteId}
                  note={note}
                  onTogglePin={() => togglePinMutation.mutate(note.noteId)}
                  onDelete={() => deleteMutation.mutate(note.noteId)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Header({
  count,
  acknowledged,
  acknowledgedBy,
  acknowledgedAt,
  onAcknowledge,
  isAcknowledging,
  disableAck,
}: {
  count: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
  disableAck: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-semibold text-foreground">
        Shift notes <span className="text-muted-foreground font-normal">· {count}</span>
      </span>
      {acknowledged ? (
        <span className="flex items-center gap-1 text-2xs text-muted-foreground">
          <Check className="h-3 w-3" />
          {acknowledgedBy ?? 'Received'}
          {acknowledgedAt && ` · ${formatRelativeTime(acknowledgedAt)}`}
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={onAcknowledge}
          loading={isAcknowledging}
          disabled={disableAck}
          className="h-6 text-2xs px-2"
        >
          Mark received
        </Button>
      )}
    </div>
  );
}

function NoteRow({ note, onTogglePin, onDelete }: { note: ShiftNote; onTogglePin: () => void; onDelete: () => void }) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded border-l-2 bg-muted/40 px-2 py-1.5 text-xs',
        PRIORITY_BORDER[note.priority] ?? PRIORITY_BORDER.info,
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-foreground truncate">{note.content}</p>
        <p className="text-2xs text-muted-foreground mt-0.5">
          {note.createdBy.name} · {formatRelativeTime(note.createdAt)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={onTogglePin}
          className="h-5 w-5 p-0"
          aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
        >
          <Pin className={cn('h-3 w-3', note.isPinned ? 'text-foreground' : 'text-muted-foreground/40')} />
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="h-5 w-5 p-0" aria-label="Delete note">
          <X className="h-3 w-3 text-muted-foreground/40" />
        </Button>
      </div>
    </li>
  );
}

function CollapsedSummary({ count, acknowledged }: { count: number; acknowledged: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 text-2xs text-muted-foreground">
      <span>
        Shift notes <span className="text-foreground tabular-nums">{count}</span>
      </span>
      {acknowledged ? (
        <span className="flex items-center gap-1">
          <Check className="h-3 w-3" /> Received
        </span>
      ) : (
        <span>Scroll up to manage</span>
      )}
    </div>
  );
}
