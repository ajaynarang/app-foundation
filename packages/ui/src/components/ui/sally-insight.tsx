import * as React from 'react';
import { cn } from '../../lib/utils';

interface AppInsightProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

function AppInsight({ className, children, ...props }: AppInsightProps) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border border-border bg-card p-3', className)} {...props}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm text-primary">
        ✦
      </div>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">{children}</div>
    </div>
  );
}

function AppInsightMessage({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex-1 text-sm text-muted-foreground', className)} {...props}>
      {children}
    </div>
  );
}

function AppInsightActions({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)} {...props}>
      {children}
    </div>
  );
}

AppInsight.Message = AppInsightMessage;
AppInsight.Actions = AppInsightActions;

export { AppInsight };
