import { cn } from '@sally/ui';

interface SallyInsightBarProps {
  message: string;
  children?: React.ReactNode;
  className?: string;
}

export function SallyInsightBar({ message, children, className }: SallyInsightBarProps) {
  return (
    <div
      className={cn('flex items-start gap-3 rounded-xl border border-border bg-card p-3 sm:items-center', className)}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm text-primary">
        ✦
      </div>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex-1 text-sm text-muted-foreground">{message}</div>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
