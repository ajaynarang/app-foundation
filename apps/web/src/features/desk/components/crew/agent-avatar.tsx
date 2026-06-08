'use client';

import { cn } from '@/shared/lib/utils';

import { AGENT_MONOGRAMS } from '../../constants';
import type { AgentKey } from '../../types';

interface AgentAvatarProps {
  agentKey: AgentKey;
  variant: 'active' | 'coming-soon';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Agent monogram avatar — two-letter initials. Active agents use a solid
 * primary tile so they read from across the room; coming-soon agents get
 * a subtle but legible muted tile with a border.
 */
export function AgentAvatar({ agentKey, variant, size = 'md', className }: AgentAvatarProps) {
  const monogram = AGENT_MONOGRAMS[agentKey] ?? agentKey.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full tracking-tight',
        size === 'sm' && 'h-7 w-7 text-[10px]',
        size === 'md' && 'h-9 w-9 text-xs',
        size === 'lg' && 'h-10 w-10 text-sm',
        variant === 'active' && 'bg-primary font-semibold text-primary-foreground',
        variant === 'coming-soon' && 'border border-border bg-muted font-medium text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      {monogram}
    </div>
  );
}
