'use client';

import { Tabs, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import type { WireTab } from '../../hooks/use-wire';

interface WireTabsProps {
  value: WireTab;
  onChange: (next: WireTab) => void;
}

const OPTIONS: Array<{ value: WireTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'alert', label: 'Alerts' },
  { value: 'message', label: 'Messages' },
  { value: 'desk', label: 'Desk' },
];

/**
 * Wire tabs — All / Alerts / Messages / Desk. No Ops tab per the brainstorm
 * (ops events still appear in All). Shadcn `Tabs` gives roving-tabindex arrow
 * navigation for free.
 */
export function WireTabs({ value, onChange }: WireTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as WireTab)}>
      <TabsList
        aria-label="Wire filter"
        className="h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-background px-3 py-1.5"
      >
        {OPTIONS.map((opt) => (
          <TabsTrigger
            key={opt.value}
            value={opt.value}
            className="rounded px-2 py-1 text-xs font-medium text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            {opt.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
