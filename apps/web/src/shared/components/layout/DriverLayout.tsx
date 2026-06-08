'use client';

import { useAuthStore } from '@/features/auth';
import { useDriverHome } from '@/features/fleet/drivers/hooks/use-driver-home';
import { useUnreadMessageCount } from '@/features/fleet/drivers/hooks/use-unread-messages';
import { useLoadMessageStream } from '@/features/fleet/loads/hooks/use-load-message-stream';
import { DriverHeader } from './DriverHeader';
import { DriverBottomTabs } from './DriverBottomTabs';

interface DriverLayoutProps {
  children: React.ReactNode;
}

export function DriverLayout({ children }: DriverLayoutProps) {
  const { isAuthenticated } = useAuthStore();

  // Real-time side effects (connection is owned by SseProvider)
  useLoadMessageStream();

  // Badge counts — drivers don't have alert access, only unread messages
  const { currentLoad } = useDriverHome();
  const { unreadCount } = useUnreadMessageCount(currentLoad?.loadNumber);

  const inboxBadge = unreadCount;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="md:flex md:items-center md:justify-center md:h-dvh md:bg-muted">
      <div className="flex flex-col h-dvh md:h-[85vh] md:max-h-[844px] md:w-[390px] md:rounded-[2.5rem] md:border-[3px] md:border-gray-300 md:dark:border-gray-700 md:shadow-2xl overflow-hidden relative bg-background">
        <DriverHeader />
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background">
          <div className="px-4 pb-20 min-w-0">{children}</div>
        </main>
        <DriverBottomTabs inboxBadge={inboxBadge} />
      </div>
    </div>
  );
}

export default DriverLayout;
