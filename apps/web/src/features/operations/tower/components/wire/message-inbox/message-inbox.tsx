'use client';

import { useMemo, useState } from 'react';
import { PenSquare, Search } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@sally/ui/components/ui/toggle-group';
import { useDriverConversations } from '../../../hooks/use-driver-conversations';
import { useTowerInteraction } from '../../../context/tower-interaction.context';
import { ConversationRow } from './conversation-row';
import { NewMessageDialog } from './new-message-dialog';

type InboxFilter = 'all' | 'unread' | 'needs-reply';

const FILTER_OPTIONS: Array<{ value: InboxFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'needs-reply', label: 'Needs reply' },
];

/**
 * Tower Wire "Messages" tab — a recency-sorted triage list of driver
 * conversations. Filter chips + search narrow the list; clicking a row opens
 * the driver thread via the Tower interaction context.
 */
export function MessageInbox() {
  const { data: conversations, isLoading } = useDriverConversations();
  const { openConversation } = useTowerInteraction();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  const visible = useMemo(() => {
    let rows = conversations ?? [];
    if (filter === 'unread') rows = rows.filter((r) => r.unreadCount > 0);
    if (filter === 'needs-reply') {
      rows = rows.filter((r) => r.whoSpokeLast === 'driver' && r.unreadCount > 0);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) => r.driverName.toLowerCase().includes(q) || (r.currentLoadNumber ?? '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [conversations, filter, search]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            value={filter}
            onValueChange={(next) => {
              if (next === 'all' || next === 'unread' || next === 'needs-reply') setFilter(next);
            }}
            aria-label="Message filter"
            className="gap-0.5"
          >
            {FILTER_OPTIONS.map((opt) => (
              <ToggleGroupItem
                key={opt.value}
                value={opt.value}
                className={cn(
                  'h-7 rounded px-2 text-xs font-medium text-muted-foreground',
                  'data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:shadow-sm',
                )}
              >
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNewMessageOpen(true)}
            className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          >
            <PenSquare className="h-3.5 w-3.5" aria-hidden />
            New
          </Button>
        </div>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver or load"
            aria-label="Search conversations"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[52px] w-full rounded-md" />)
        ) : visible.length === 0 ? (
          <EmptyState hasFilter={filter !== 'all' || search.trim().length > 0} />
        ) : (
          visible.map((c) => <ConversationRow key={c.driverId} conversation={c} onOpen={openConversation} />)
        )}
      </div>

      <NewMessageDialog open={newMessageOpen} onOpenChange={setNewMessageOpen} onPick={openConversation} />
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        {hasFilter ? 'No conversations match' : 'No conversations yet'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {hasFilter ? 'Try a different filter or search.' : 'Driver messages appear here.'}
      </p>
    </div>
  );
}
