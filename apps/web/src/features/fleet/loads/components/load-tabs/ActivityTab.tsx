'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { useLoadActivity, useAddNote } from '@/features/fleet/loads/hooks/use-loads';
import { ChatConversation } from '@/features/fleet/drivers/components/ChatConversation';
import { useUnreadMessageCount } from '@/features/fleet/drivers/hooks/use-unread-messages';
import type { Load } from '@/features/fleet/loads/types';

interface ActivityTabProps {
  load: Load;
}

export function ActivityTab({ load }: ActivityTabProps) {
  const { formatTimestamp } = useFormatters();
  const { data: activity, isLoading: activityLoading } = useLoadActivity(load.loadNumber);
  const addNoteMutation = useAddNote();
  const [noteContent, setNoteContent] = useState('');
  const { unreadCount } = useUnreadMessageCount(load.loadNumber);

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    addNoteMutation.mutate(
      { loadId: load.loadNumber, data: { content: noteContent.trim() } },
      { onSuccess: () => setNoteContent('') },
    );
  };

  return (
    <div className="space-y-6">
      {/* Notes */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</h4>
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a note..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={handleAddNote}
            loading={addNoteMutation.isPending}
            disabled={!noteContent.trim()}
            className="self-end"
          >
            Post
          </Button>
        </div>
      </div>

      {/* Activity timeline */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Activity</h4>
        {activityLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : !activity?.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No activity yet</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {activity.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className={`text-xs p-2 rounded-md ${
                  item.type === 'event' ? 'bg-muted/50' : 'bg-card border border-border'
                }`}
              >
                {item.type === 'event' ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      {item.description || `${item.eventType}: ${item.fromValue || ''} → ${item.toValue || ''}`}
                    </span>
                    <span className="text-muted-foreground flex-shrink-0">
                      {formatTimestamp(item.createdAt, DISPLAY_FORMATS.COMPACT_DATE_TIME)}
                    </span>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge variant="outline" className="text-2xs px-1.5 py-0">
                        {item.noteType || 'general'}
                      </Badge>
                      <span className="text-muted-foreground flex-shrink-0">
                        {formatTimestamp(item.createdAt, DISPLAY_FORMATS.COMPACT_DATE_TIME)}
                      </span>
                    </div>
                    <p className="text-foreground">{item.content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Messages — always visible, no toggle */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Messages</h4>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {unreadCount}
            </Badge>
          )}
        </div>
        <div className="rounded-lg border border-border overflow-hidden h-[26.9rem]">
          {load.driverId == null ? (
            // Messaging is driver-keyed — an unassigned load has nobody to message.
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
              <MessageSquare className="h-7 w-7 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">No driver assigned</p>
              <p className="text-xs text-muted-foreground">Assign a driver to this load to start messaging.</p>
            </div>
          ) : (
            <ChatConversation loadId={load.loadNumber} senderRole="dispatcher" compact />
          )}
        </div>
      </div>
    </div>
  );
}
