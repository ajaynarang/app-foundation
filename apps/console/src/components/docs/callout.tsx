import { cn } from '@sally/ui';
import { Info, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';

interface CalloutProps {
  type?: 'info' | 'warning' | 'error' | 'success';
  children: React.ReactNode;
}

const config = {
  info: {
    icon: Info,
    className: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
    iconClassName: 'text-blue-600 dark:text-blue-400',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30',
    iconClassName: 'text-yellow-600 dark:text-yellow-400',
  },
  error: {
    icon: XCircle,
    className: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
    iconClassName: 'text-red-600 dark:text-red-400',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30',
    iconClassName: 'text-green-600 dark:text-green-400',
  },
};

export function Callout({ type = 'info', children }: CalloutProps) {
  const { icon: Icon, className, iconClassName } = config[type];

  return (
    <div className={cn('flex gap-3 rounded-lg border p-4 my-4', className)}>
      <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', iconClassName)} />
      <div className="text-sm text-foreground [&>p]:mb-0">{children}</div>
    </div>
  );
}
