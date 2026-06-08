'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { cn } from '@/shared/lib/utils';

interface SheetSectionProps {
  icon: LucideIcon;
  title: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function SheetSection({
  icon: Icon,
  title,
  defaultOpen = true,
  collapsible = true,
  children,
  badge,
  actions,
}: SheetSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</span>
        {badge}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {collapsible && (
          <ChevronDown
            className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
          />
        )}
      </div>
    </div>
  );

  if (!collapsible) {
    return (
      <section>
        <div className="mb-3">{header}</div>
        {children}
      </section>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {header}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
