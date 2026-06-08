'use client';

import { Button } from '@sally/ui/components/ui/button';

interface QuickActionChipsProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  role?: 'driver' | 'dispatcher';
}

const DRIVER_CHIPS = ['Copy that', 'Running late ~30min', 'At dock waiting', 'Need help', 'Loaded, heading out'];

const DISPATCHER_CHIPS = [
  'Update ETA?',
  'Call when arrived',
  'Check in when loaded',
  'Head to next stop',
  'Acknowledged',
];

export function QuickActionChips({ onSend, disabled, role = 'driver' }: QuickActionChipsProps) {
  const chips = role === 'dispatcher' ? DISPATCHER_CHIPS : DRIVER_CHIPS;

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      {chips.map((text) => (
        <Button
          key={text}
          variant="outline"
          size="sm"
          className="shrink-0 text-xs h-7"
          onClick={() => onSend(text)}
          disabled={disabled}
        >
          {text}
        </Button>
      ))}
    </div>
  );
}
