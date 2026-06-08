'use client';

import { Zap } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';

interface ActionFABProps {
  visible: boolean;
  onClick: () => void;
}

export function ActionFAB({ visible, onClick }: ActionFABProps) {
  return (
    <div
      className={cn(
        'fixed bottom-[calc(var(--tab-bar-height,64px)+12px)] left-4 z-40',
        'transition-all duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-4 opacity-0 pointer-events-none',
      )}
      aria-hidden={!visible}
    >
      <Button
        onClick={onClick}
        className={cn(
          'h-11 rounded-full px-4 gap-1.5 shadow-lg',
          'bg-foreground text-background hover:bg-foreground/90',
          'active:scale-95 transition-transform',
        )}
      >
        <Zap className="h-4 w-4" aria-hidden />
        <span className="text-sm font-semibold">Actions</span>
      </Button>
    </div>
  );
}
