'use client';

import { useState } from 'react';
import { Pin, PinOff, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

import { useDeleteMemory, useSetMemoryPinned, useUpdateMemory } from '../../../hooks/use-memories';
import { MEMORY_POLARITY_LABELS, MEMORY_SCOPE_LABELS } from '../../../constants';
import type { MemoryRecord } from '../../../types';

interface MemoryCardProps {
  memory: MemoryRecord;
  canEdit: boolean;
  lockedTooltip?: string;
}

/**
 * Memory card — renders one DeskMemory row.
 *
 * The Edit button is shown only for operator-authored playbook rows
 * (`authoredByUserId !== null`). LLM-extracted memories (entity / pattern)
 * stay read-only by design — operators who disagree pin the opposite
 * intent or remove the row, keeping the LLM-extracted corpus
 * single-voiced.
 *
 * Pin/Remove are gated on `canEdit` (supervisor-or-admin permission).
 */
export function MemoryCard({ memory, canEdit, lockedTooltip }: MemoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const content = draftContent ?? memory.content;

  const update = useUpdateMemory();
  const setPinned = useSetMemoryPinned();
  const remove = useDeleteMemory();

  const isOperatorAuthored = memory.authoredByUserId !== null;
  const allowEdit = canEdit && isOperatorAuthored;

  return (
    <li className={cn('rounded-md border border-border bg-card p-3', !memory.isActive && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="muted" className="text-[10px] uppercase tracking-wider">
            {MEMORY_SCOPE_LABELS[memory.scope]}
          </Badge>
          <Badge
            variant={memory.polarity === 'REINFORCE' ? 'default' : 'caution'}
            className="text-[10px] uppercase tracking-wider"
          >
            {MEMORY_POLARITY_LABELS[memory.polarity]}
          </Badge>
          {memory.isPinned && (
            <Badge variant="muted" className="text-[10px] uppercase tracking-wider" aria-label="Pinned">
              <Pin className="mr-1 h-2.5 w-2.5" />
              Pinned
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{formatRelativeTime(memory.updatedAt)}</span>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={content}
            rows={3}
            onChange={(e) => setDraftContent(e.target.value)}
            aria-label="Memory content"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                update.mutate(
                  { id: memory.id, body: { content: content.trim() } },
                  {
                    onSuccess: () => {
                      setEditing(false);
                      setDraftContent(null);
                    },
                  },
                )
              }
              loading={update.isPending}
              disabled={content.trim().length === 0}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraftContent(null);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{memory.content}</p>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Pin/Unpin — gated on canEdit; available for every scope. */}
          <ActionButton canEdit={canEdit} lockedTooltip={lockedTooltip}>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canEdit}
              loading={setPinned.isPending}
              onClick={() => setPinned.mutate({ id: memory.id, isPinned: !memory.isPinned })}
            >
              {memory.isPinned ? (
                <>
                  <PinOff className="mr-1 h-3.5 w-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="mr-1 h-3.5 w-3.5" />
                  Pin
                </>
              )}
            </Button>
          </ActionButton>

          {/* Edit — operator-authored playbook rules only.
              LLM-extracted memories stay read-only on purpose (see
              file-header comment). */}
          {isOperatorAuthored && (
            <ActionButton canEdit={canEdit} lockedTooltip={lockedTooltip}>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={!allowEdit}>
                Edit
              </Button>
            </ActionButton>
          )}

          <ActionButton canEdit={canEdit} lockedTooltip={lockedTooltip}>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!canEdit}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Forget this memory?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sally will no longer use this lesson when handling future episodes. If the pattern reappears, she
                    may relearn it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate(memory.id)}>Forget it</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </ActionButton>
        </div>
      )}
    </li>
  );
}

function ActionButton({
  canEdit,
  lockedTooltip,
  children,
}: {
  canEdit: boolean;
  lockedTooltip?: string;
  children: React.ReactNode;
}) {
  if (canEdit || !lockedTooltip) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{lockedTooltip}</TooltipContent>
    </Tooltip>
  );
}
