'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { cn } from '@sally/ui';
import { useLoadMessages, useSendMessage } from '../hooks/use-driver-messages';
import { useUnreadMessageCount } from '../hooks/use-unread-messages';
import { QuickActionChips } from './QuickActionChips';
import type { LoadMessage } from '../api/driver-messages.api';
import type { Alert } from '@/features/operations/alerts/types';

interface ChatConversationProps {
  loadId: string;
  loadNumber?: string;
  onBack?: () => void;
  compact?: boolean;
  senderRole?: 'driver' | 'dispatcher';
  inlineAlerts?: Alert[];
  onAcknowledgeAlert?: (alertId: string) => void;
}

function MessageBubble({ message, viewerRole }: { message: LoadMessage; viewerRole: 'driver' | 'dispatcher' }) {
  const isSystem = message.role === 'system';
  // "Mine" = the message was sent by whoever is viewing
  const isMine = message.role === viewerRole;

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{message.content}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex mb-2', isMine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
          isMine ? 'bg-foreground text-background rounded-br-md' : 'bg-muted text-foreground rounded-bl-md',
        )}
      >
        {message.content}
        <div
          className={cn(
            'text-2xs mt-0.5 flex items-center gap-1',
            isMine ? 'text-background/60' : 'text-muted-foreground',
          )}
        >
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {isMine && (
            <span className={cn('text-2xs', isMine ? 'text-background/50' : 'text-muted-foreground/70')}>
              delivered
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineAlertCard({ alert, onAcknowledge }: { alert: Alert; onAcknowledge?: () => void }) {
  return (
    <div className="mx-3 my-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{alert.title}</p>
          {alert.recommendedAction && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{alert.recommendedAction}</p>
          )}
        </div>
      </div>
      {onAcknowledge && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs border-amber-300 dark:border-amber-700"
          onClick={onAcknowledge}
        >
          Acknowledge
        </Button>
      )}
    </div>
  );
}

export function ChatConversation({
  loadId,
  loadNumber,
  onBack,
  compact = false,
  senderRole = 'driver',
  inlineAlerts = [],
  onAcknowledgeAlert,
}: ChatConversationProps) {
  const { data: messages = [], isLoading } = useLoadMessages(loadId);
  const sendMutation = useSendMessage(senderRole);
  const { markAsRead } = useUnreadMessageCount(loadId);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mark conversation as read when opened or loadId changes
  useEffect(() => {
    markAsRead();
  }, [loadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = (content?: string) => {
    const text = (content || input).trim();
    if (!text) return;
    sendMutation.mutate({ loadId, content: text });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: compact ? 3 : 5 }).map((_, i) => (
          <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
            <Skeleton className="h-10 w-48 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', compact ? 'flex-1 min-h-0' : 'h-[calc(100dvh-8rem)]')}>
      {/* Header — hidden in compact mode */}
      {!compact && (
        <div className="flex items-center gap-3 py-3 border-b border-border">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Dispatch</p>
            {loadNumber && <p className="text-xs text-muted-foreground">Load {loadNumber}</p>}
          </div>
        </div>
      )}

      {/* Compact header — just the load number */}
      {compact && loadNumber && (
        <div className="py-2 px-3">
          <p className="text-xs text-muted-foreground">Load {loadNumber}</p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className={cn('flex-1 overflow-y-auto py-3 space-y-1', compact && 'px-3')}>
        {/* Inline alert cards — rendered at top of thread */}
        {inlineAlerts.map((alert) => (
          <InlineAlertCard
            key={alert.alertId}
            alert={alert}
            onAcknowledge={onAcknowledgeAlert ? () => onAcknowledgeAlert(alert.alertId) : undefined}
          />
        ))}

        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {senderRole === 'dispatcher'
              ? 'No messages yet. Send a message to the driver.'
              : 'No messages yet. Send a message to your dispatcher.'}
          </p>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} viewerRole={senderRole} />)
        )}
      </div>

      {/* Quick action chips */}
      <div className={cn(compact && 'px-3')}>
        <QuickActionChips onSend={handleSend} disabled={sendMutation.isPending} role={senderRole} />
      </div>

      {/* Input */}
      <div className={cn('flex items-end gap-2 py-2 border-t border-border', compact && 'px-3')}>
        {compact ? (
          <Input
            placeholder={senderRole === 'dispatcher' ? 'Message driver...' : 'Type a message...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
        ) : (
          <Textarea
            placeholder={senderRole === 'dispatcher' ? 'Message driver...' : 'Message dispatch...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-h-[52px] max-h-[120px] resize-none"
            rows={1}
          />
        )}
        <Button size="icon" onClick={() => handleSend()} loading={sendMutation.isPending} disabled={!input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
