'use client';

import { cn } from '@sally/ui';
import { formatLoadLabel, type DriverConversationSummary } from '@sally/shared-types';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

interface ConversationRowProps {
  conversation: DriverConversationSummary;
  onOpen: (driverId: string) => void;
}

/**
 * One driver conversation in the Tower Messages triage list. Two lines:
 * driver + load chip + timestamp + unread on line 1, last-message preview on
 * line 2. A leading dot marks "driver spoke last" (needs a reply).
 */
export function ConversationRow({ conversation, onOpen }: ConversationRowProps) {
  const needsReply = conversation.whoSpokeLast === 'driver' && conversation.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(conversation.driverId)}
      aria-label={`Open conversation with ${conversation.driverName}`}
      className={cn(
        'flex w-full flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2 text-left',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        conversation.hasActiveAlert && 'border-l-2 border-l-red-500 dark:border-l-red-400',
      )}
    >
      <div className="flex items-center gap-2">
        {needsReply && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 dark:bg-blue-400" aria-label="Needs reply" />
        )}
        <span className={cn('truncate text-sm text-foreground', needsReply && 'font-semibold')}>
          {conversation.driverName}
        </span>
        {conversation.currentLoadNumber && (
          <span className="shrink-0 text-2xs text-muted-foreground">
            {formatLoadLabel(conversation.currentLoadNumber, conversation.currentLoadReference)}
          </span>
        )}
        <span className="ml-auto shrink-0 text-2xs tabular-nums text-muted-foreground">
          {conversation.lastMessageAt ? formatRelativeTime(conversation.lastMessageAt) : ''}
        </span>
        {conversation.unreadCount > 0 && (
          <span className="shrink-0 rounded-full bg-foreground px-1.5 text-2xs font-medium text-background">
            {conversation.unreadCount}
          </span>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">{conversation.lastMessage ?? 'No messages yet'}</p>
    </button>
  );
}
