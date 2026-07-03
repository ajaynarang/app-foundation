'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Users, DollarSign, Check, CheckCheck, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@app/ui/components/ui/sheet';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { ScrollArea } from '@app/ui/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@app/ui/components/ui/tabs';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import {
  useNotifications,
  useNotificationCount,
  useMarkAsRead,
  useDismissNotification,
  useMarkAllRead,
  useMarkAsUnread,
  type Notification,
} from './use-notifications';
import { showSuccess, showError } from '@app/ui';
import { openConsole } from '@appshore/web-core/shared/lib/console-url';

interface NotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  SYSTEM: Settings,
  TEAM: Users,
  BILLING: DollarSign,
};

const TABS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'SYSTEM', label: 'System' },
  { key: 'TEAM', label: 'Team' },
  { key: 'BILLING', label: 'Billing' },
];

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function NotificationSheet({ open, onOpenChange }: NotificationSheetProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('ALL');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const category = activeTab === 'ALL' ? undefined : activeTab;
  const { data: notifData, isLoading, refetch } = useNotifications({ category, limit: 20 });

  // Refetch when sheet opens to ensure fresh data
  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);
  const { data: countData } = useNotificationCount();
  const markAsRead = useMarkAsRead();
  const markAsUnread = useMarkAsUnread();
  const dismiss = useDismissNotification();
  const markAllRead = useMarkAllRead();

  const notifications = notifData?.data ?? [];

  const navigateToAction = (url: string) => {
    if (url.startsWith('console:')) {
      openConsole(url.slice('console:'.length));
    } else {
      router.push(url);
    }
    onOpenChange(false);
  };

  const handleClick = (notif: Notification) => {
    if (!notif.readAt) {
      markAsRead.mutate(notif.notificationId);
    }
    if (notif.actionUrl) {
      navigateToAction(notif.actionUrl);
    }
  };

  const handleDismiss = (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation();
    dismiss.mutate(notifId, {
      onSuccess: () => showSuccess('Notification dismissed'),
      onError: () => showError('Failed to dismiss notification'),
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(category, {
      onSuccess: () => showSuccess('All notifications marked as read'),
      onError: () => showError('Failed to mark all as read'),
    });
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const getTabCount = (tab: string): number => {
    if (!countData) return 0;
    switch (tab) {
      case 'ALL':
        return countData.total;
      case 'SYSTEM':
        return countData.system;
      case 'TEAM':
        return countData.team;
      case 'BILLING':
        return countData.billing;
      default:
        return 0;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pr-14 pt-4 pb-2 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications</SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={handleMarkAllRead}
              disabled={(countData?.total ?? 0) === 0}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-2 grid grid-cols-4">
            {TABS.map((tab) => {
              const count = getTabCount(tab.key);
              return (
                <TabsTrigger key={tab.key} value={tab.key} className="text-xs">
                  {tab.label}
                  {count > 0 && (
                    <Badge variant="muted" className="ml-1 h-4 min-w-4 px-1 text-2xs">
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-4 space-y-2">
              {isLoading && (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 p-3">
                      <Skeleton className="h-9 w-9 rounded-md shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </>
              )}

              {!isLoading && notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Check className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
                </div>
              )}

              {!isLoading &&
                notifications.map((notif) => {
                  const Icon = CATEGORY_ICON[notif.category ?? 'SYSTEM'] ?? Settings;
                  const isUnread = !notif.readAt;
                  const isGrouped = (notif.groupCount ?? 1) > 1;
                  const isExpanded = expandedGroups.has(notif.notificationId);
                  const items =
                    ((notif.metadata as Record<string, unknown>)?.items as Array<{
                      title?: string;
                      message?: string;
                      actionUrl?: string;
                    }>) ?? [];

                  return (
                    <div key={notif.notificationId}>
                      <div
                        className={`group flex gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                          isUnread ? 'border-l-2 border-l-info bg-info/5' : ''
                        }`}
                        onClick={() => handleClick(notif)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (notif.readAt) {
                            markAsUnread.mutate(notif.notificationId);
                          }
                        }}
                      >
                        <div className="shrink-0 h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-foreground truncate">{notif.title}</p>
                            <button
                              className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-muted transition-opacity"
                              onClick={(e) => handleDismiss(e, notif.notificationId)}
                            >
                              <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notif.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-2xs text-muted-foreground">
                              {formatRelativeTime(notif.createdAt)}
                            </span>
                            {notif.actionLabel && (
                              <span className="text-2xs text-info">{notif.actionLabel} &rarr;</span>
                            )}
                            {isGrouped && (
                              <button
                                className="text-2xs text-muted-foreground flex items-center gap-0.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleGroup(notif.notificationId);
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )}
                                {notif.groupCount} items
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {isGrouped && isExpanded && items.length > 0 && (
                        <div className="ml-12 pl-3 border-l border-border space-y-1 mb-2">
                          {items.map((item, i) => (
                            <div
                              key={i}
                              className="py-1.5 px-2 rounded text-xs text-muted-foreground hover:bg-muted/50 cursor-pointer"
                              onClick={() => {
                                if (item.actionUrl) {
                                  navigateToAction(item.actionUrl);
                                }
                              }}
                            >
                              <span className="font-medium text-foreground">{item.title}</span>
                              {item.message && <span className="ml-1">&mdash; {item.message}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
