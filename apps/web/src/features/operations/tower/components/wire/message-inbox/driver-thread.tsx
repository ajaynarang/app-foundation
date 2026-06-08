'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@sally/ui';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { formatLoadLabel, type LoadMessage } from '@sally/shared-types';
import { useDriverThread, useSendDriverMessage, useMarkDriverThreadRead } from '../../../hooks/use-driver-thread';
import { MessageComposer } from '@/shared/components/messaging/message-composer';

interface DriverThreadProps {
  driverId: string;
  /** The driver's active load numbers — the composer's @-mention options. */
  activeLoadNumbers: string[];
}

/**
 * The message thread for one driver, shown inside the Tower ConversationSheet.
 * The composer tags messages to a load via @-mention (see MessageComposer).
 */
export function DriverThread({ driverId, activeLoadNumbers }: DriverThreadProps) {
  const { data: messages = [], isLoading } = useDriverThread(driverId);
  const sendMutation = useSendDriverMessage(driverId);
  const markRead = useMarkDriverThreadRead();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark the thread read on open.
  useEffect(() => {
    markRead.mutate(driverId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

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
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-3/4 rounded-lg" />)
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No messages yet — start the conversation.</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <MessageComposer activeLoadNumbers={activeLoadNumbers} isSending={sendMutation.isPending} onSend={handleSend} />
    </div>
  );
}

/** One message bubble — dispatcher messages align right, driver/system left. */
function MessageBubble({ message }: { message: LoadMessage }) {
  const isMine = message.role === 'dispatcher';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return <p className="text-center text-2xs text-muted-foreground">{message.content}</p>;
  }

  return (
    <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm',
          isMine ? 'bg-foreground text-background' : 'bg-muted text-foreground',
        )}
      >
        {message.loadNumber && (
          <span className={cn('block text-2xs', isMine ? 'text-background/70' : 'text-muted-foreground')}>
            re: {formatLoadLabel(message.loadNumber, message.loadReference)}
          </span>
        )}
        {message.content}
      </div>
    </div>
  );
}
