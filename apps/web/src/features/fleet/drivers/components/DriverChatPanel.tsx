'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@sally/ui';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { formatLoadLabel, type LoadMessage } from '@sally/shared-types';
import { MessageComposer } from '@/shared/components/messaging/message-composer';
import { useMyConversation, useSendMyMessage, useMarkMyConversationRead } from '../hooks/use-my-conversation';

interface DriverChatPanelProps {
  /** The driver's current active load number — the @-mention picker option. */
  currentLoadNumber?: string;
}

/**
 * The driver's Dispatch-tab chat — their FULL conversation with dispatch,
 * every message regardless of which load it's tagged to (driver-keyed).
 *
 * One chronological thread. The current load is anchored by the banner above
 * this panel, so a message about the current load reads clean. A message
 * about a *different* load, or a general (no-load) message, gets a context
 * label — load context surfaces only on the exceptions.
 */
export function DriverChatPanel({ currentLoadNumber }: DriverChatPanelProps) {
  const { data: messages = [], isLoading } = useMyConversation();
  const sendMutation = useSendMyMessage();
  const markRead = useMarkMyConversationRead();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark the thread read on open.
  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSend = (content: string, loadNumber: string | null) => {
    sendMutation.mutate({ content, loadNumber });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-3/4 rounded-2xl" />)
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages yet. Send a message to your dispatcher.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} currentLoadNumber={currentLoadNumber} />)
        )}
      </div>

      <MessageComposer
        activeLoadNumbers={currentLoadNumber ? [currentLoadNumber] : []}
        isSending={sendMutation.isPending}
        onSend={handleSend}
        placeholder="Message dispatch…  @ to tag a load"
      />
    </div>
  );
}

/**
 * One message bubble — the driver's own messages align right, dispatch left.
 *
 * Context label rule: a message about the driver's *current* load shows none
 * (the banner already says it). A message about a different load shows that
 * load; a general (no-load) message gets a distinct "General" tag + accent.
 */
function MessageBubble({ message, currentLoadNumber }: { message: LoadMessage; currentLoadNumber?: string }) {
  const isMine = message.role === 'driver';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return <p className="text-center text-2xs text-muted-foreground">{message.content}</p>;
  }

  // General message — no load tag at all.
  const isGeneral = !message.loadNumber;
  // Load-tagged, but a load other than the one the driver is currently on.
  const isOtherLoad = !!message.loadNumber && !!currentLoadNumber && message.loadNumber !== currentLoadNumber;

  return (
    <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
          isMine ? 'bg-foreground text-background rounded-br-md' : 'bg-muted text-foreground rounded-bl-md',
          // General messages stand apart from load instructions with a caution
          // (yellow) left accent — Sally's Caution palette token.
          isGeneral && !isMine && 'border-l-2 border-l-yellow-500 dark:border-l-yellow-400',
        )}
      >
        {/* Context label — only when it's NOT about the current load. */}
        {isGeneral && (
          <span
            className={cn(
              'mb-0.5 block text-2xs font-medium uppercase tracking-wide',
              isMine ? 'text-background/70' : 'text-yellow-600 dark:text-yellow-500',
            )}
          >
            General
          </span>
        )}
        {isOtherLoad && message.loadNumber && (
          <span className={cn('mb-0.5 block text-2xs', isMine ? 'text-background/70' : 'text-muted-foreground')}>
            re: {formatLoadLabel(message.loadNumber, message.loadReference)}
          </span>
        )}
        {message.content}
      </div>
    </div>
  );
}
