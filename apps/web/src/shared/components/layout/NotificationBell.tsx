'use client';

import { Bell } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { useNotificationCount } from '@/features/operations/notifications';

interface NotificationBellProps {
  onClick: () => void;
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const { data: countData } = useNotificationCount();
  const total = countData?.total ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={onClick}
      aria-label={`Notifications${total > 0 ? ` (${total} unread)` : ''}`}
    >
      <Bell className="h-5 w-5" />
      {total > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
        >
          {total > 99 ? '99+' : total}
        </Badge>
      )}
    </Button>
  );
}
