'use client';

import { DollarSign, Clock, Scale, Fuel, AlertTriangle, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { cn } from '@sally/ui';

export type ActionType = 'lumper' | 'detention' | 'scale_ticket' | 'fuel_receipt' | 'issue_report';

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadNumber?: string;
  facilityName?: string;
  onAction: (action: ActionType) => void;
}

const HERO_ACTIONS = [
  {
    key: 'lumper' as const,
    label: 'Lumper\nFunds',
    description: 'Request money code',
    icon: DollarSign,
    color: 'text-green-400',
    bg: 'bg-green-400/10',
  },
  {
    key: 'detention' as const,
    label: 'Report\nDetention',
    description: 'Start billing clock',
    icon: Clock,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
  },
];

const SECONDARY_ACTIONS = [
  {
    key: 'scale_ticket' as const,
    label: 'Scale Ticket',
    description: 'Photo + weight',
    icon: Scale,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
  },
  {
    key: 'fuel_receipt' as const,
    label: 'Fuel Receipt',
    description: 'IFTA tracking',
    icon: Fuel,
    color: 'text-blue-300',
    bg: 'bg-blue-300/10',
  },
  {
    key: 'issue_report' as const,
    label: 'Report Issue',
    description: 'Breakdown or problem',
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-400/10',
  },
];

export function ActionSheet({ open, onOpenChange, loadNumber, facilityName, onAction }: ActionSheetProps) {
  const handleAction = (action: ActionType) => {
    onOpenChange(false);
    onAction(action);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-left">Actions</SheetTitle>
          <p className="text-sm text-muted-foreground text-left">
            {loadNumber && `Load ${loadNumber}`}
            {facilityName && ` · ${facilityName}`}
          </p>
        </SheetHeader>

        {/* Hero actions — 2 large cards side by side */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {HERO_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                className="flex flex-col gap-2.5 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 active:scale-[0.98] transition-all text-left min-h-[120px]"
                onClick={() => handleAction(action.key)}
              >
                <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', action.bg)}>
                  <Icon className={cn('h-5 w-5', action.color)} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground whitespace-pre-line">{action.label}</p>
                  <p className="text-2xs text-muted-foreground mt-0.5">{action.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Secondary actions — compact list */}
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {SECONDARY_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left"
                onClick={() => handleAction(action.key)}
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', action.bg)}>
                  <Icon className={cn('h-4 w-4', action.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{action.label}</p>
                  <p className="text-2xs text-muted-foreground">{action.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
