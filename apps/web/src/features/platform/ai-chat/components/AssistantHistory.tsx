'use client';

import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { MAX_ACTIVE_CONVERSATIONS, type ConversationSummary } from '@app/shared-types';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import { ListErrorState, RelativeTime, RowActions } from '@app/ui/components/page-chrome';
import { cn } from '@app/ui';
import { useConversationHistory, useDeleteConversation } from '../hooks/use-conversation-history';
import { groupConversationsByRecency } from '../lib/history';

interface AssistantHistoryProps {
  /** Open a past conversation (view-only in the starter). */
  onOpen: (conversationId: string) => void;
  /** The conversation on screen now, marked in the list. */
  activeId?: string | null;
  /** Called after the conversation on screen is removed, so the caller can leave it. */
  onActiveRemoved?: () => void;
}

const titleOf = (c: ConversationSummary) => c.title || 'Untitled conversation';

/**
 * The person's conversation history: active conversations grouped by recency, searchable by title, each removable.
 * Removing archives it on the server (its messages are kept); history keeps the newest `MAX_ACTIVE_CONVERSATIONS`.
 */
export function AssistantHistory({ onOpen, activeId, onActiveRemoved }: AssistantHistoryProps) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useConversationHistory();
  const remove = useDeleteConversation();
  const [search, setSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<ConversationSummary | null>(null);

  const groups = useMemo(() => {
    const all = data?.conversations ?? [];
    const query = search.trim().toLowerCase();
    const filtered = query ? all.filter((c) => titleOf(c).toLowerCase().includes(query)) : all;
    return groupConversationsByRecency(filtered);
  }, [data, search]);

  const handleRemove = () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setConfirmTarget(null);
    remove.mutate(target.conversationId, {
      onSuccess: () => {
        if (target.conversationId === activeId) onActiveRemoved?.();
      },
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          aria-label="Search conversations"
          className="h-8 pl-8 text-sm"
        />
      </div>

      {isLoading && (
        <div className="space-y-2" data-testid="history-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      )}

      {isError && (
        <ListErrorState
          title="Couldn't load your conversations."
          error={error}
          onRetry={() => void refetch()}
          isRetrying={isRefetching}
        />
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {search ? `No conversations match “${search}”` : 'No conversations yet'}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-2 pb-1 pt-2 text-2xs uppercase tracking-wider text-muted-foreground">{group.label}</p>
          {group.conversations.map((conversation) => {
            const isActive = conversation.conversationId === activeId;
            return (
              <div
                key={conversation.conversationId}
                className={cn('group flex items-center rounded-lg', isActive ? 'bg-primary/10' : 'hover:bg-muted/60')}
              >
                <Button
                  variant="ghost"
                  onClick={() => onOpen(conversation.conversationId)}
                  aria-current={isActive ? 'true' : undefined}
                  className="h-auto min-w-0 flex-1 justify-start rounded-lg px-2.5 py-2 text-left hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground">{titleOf(conversation)}</span>
                    <span className="block text-2xs font-normal text-muted-foreground">
                      {conversation.messageCount} messages · <RelativeTime iso={conversation.lastMessageAt} />
                    </span>
                  </span>
                </Button>
                <RowActions
                  className="mr-1"
                  items={[
                    {
                      label: 'Remove',
                      ariaLabel: `Remove ${titleOf(conversation)} from history`,
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => setConfirmTarget(conversation),
                    },
                  ]}
                />
              </div>
            );
          })}
        </div>
      ))}

      {!isLoading && !isError && (data?.conversations.length ?? 0) > 0 && (
        <p className="pt-1 text-center text-2xs text-muted-foreground">
          History keeps your last {MAX_ACTIVE_CONVERSATIONS} conversations
        </p>
      )}

      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this conversation from history?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirmTarget ? titleOf(confirmTarget) : ''}” will no longer appear in your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemove}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
