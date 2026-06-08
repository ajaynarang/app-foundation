'use client';

/**
 * ArrivalCard — Combined arrival banner + Sally tip (Redesign #6).
 * Contextual color: green for pickup, red for delivery.
 * Replaces the old separate arrival banner + SallyTipCard.
 */

import { MapPin, Sparkles, X } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';

const TIPS: Record<'pickup' | 'delivery', string> = {
  pickup: 'Check your BOL carefully. Confirm piece count and seal number before departing.',
  delivery: 'Get your POD signed. Take photos of the delivery for your records.',
};

interface ArrivalCardProps {
  stopType: 'pickup' | 'delivery';
  stopName?: string;
  onDismiss: () => void;
}

export function ArrivalCard({ stopType, stopName, onDismiss }: ArrivalCardProps) {
  const isDelivery = stopType === 'delivery';
  const label = isDelivery ? 'Delivery' : 'Pickup';

  return (
    <div className="rounded-xl border border-border relative overflow-hidden bg-card">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-6 w-6 p-0 z-10 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>

      <div className="flex gap-3 p-3 pr-10">
        {/* Icon */}
        <div className="h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0 bg-muted">
          <MapPin className="h-[18px] w-[18px] text-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Arrival title */}
          <p className="text-sm font-semibold text-foreground">You&apos;ve Arrived — {label}</p>
          {stopName && <p className="text-xs text-muted-foreground mt-0.5 truncate">{stopName}</p>}

          {/* Sally tip — integrated */}
          <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-border/30">
            <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">{TIPS[stopType]}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
