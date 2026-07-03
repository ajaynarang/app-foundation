import { cn } from '@appshore/web-core/shared/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-md bg-muted relative overflow-hidden',
        // Shimmer gradient overlay
        'before:absolute before:inset-0 before:animate-shimmer',
        'before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.04] before:to-transparent',
        'before:bg-[length:200%_100%]',
        // Dark mode shimmer
        'dark:before:via-foreground/[0.06]',
        // Reduced motion: disable shimmer
        'motion-reduce:before:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
