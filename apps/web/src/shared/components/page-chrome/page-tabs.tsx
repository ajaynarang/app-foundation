'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Tabs } from '@/shared/components/ui/tabs';
import { cn } from '@appshore/web-core/shared/lib/utils';

/**
 * PageTabs — underline-styled content tabs for Zone 2 (Control bar) of the page chrome.
 *
 * The base @/shared/components/ui/tabs is the pill/segmented style (used inside cards,
 * for view toggles). Page-level content tabs use the underline treatment so they read
 * as navigation, distinct from the segmented view/group switchers in the right cluster.
 *
 * Usage:
 *   <PageTabs value={tab} onValueChange={setTab}>
 *     <PageToolbar tabs={<PageTabsList><PageTabsTrigger value="a">A</PageTabsTrigger>…</PageTabsList>} … />
 *     <TabsContent value="a">…</TabsContent>
 *   </PageTabs>
 *
 * Re-export TabsContent from @/shared/components/ui/tabs for the panels.
 */
export { Tabs as PageTabs };

export const PageTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex h-10 items-center gap-4 border-b border-border bg-transparent p-0', className)}
    {...props}
  />
));
PageTabsList.displayName = 'PageTabsList';

export interface PageTabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Optional trailing count, e.g. History (306). */
  count?: number;
}

export const PageTabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, PageTabsTriggerProps>(
  ({ className, children, count, ...props }, ref) => (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'relative inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-none border-b-2 border-transparent px-1 pb-2 pt-2 text-sm font-medium text-muted-foreground ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-foreground data-[state=active]:text-foreground',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="text-muted-foreground/70">{count}</span>}
    </TabsPrimitive.Trigger>
  ),
);
PageTabsTrigger.displayName = 'PageTabsTrigger';
