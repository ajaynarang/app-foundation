import Link from 'next/link';
import { UserPlus, Plug, Key } from 'lucide-react';
import { cn } from '@app/ui';

const actions = [
  { label: 'Invite Team Member', href: '/team/invitations', icon: UserPlus },
  { label: 'Connect Integration', href: '/integrations/connections', icon: Plug },
  { label: 'Generate API Key', href: '/developer/api-keys', icon: Key },
];

export function QuickActions() {
  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-foreground">Quick Actions</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className={cn(
                'flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3',
                'text-sm font-medium text-foreground',
                'transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                'min-h-[44px]',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {action.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
